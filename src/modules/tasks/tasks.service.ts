import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NotificationChannel, Prisma, TaskStatus } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

interface TaskStepMeta {
  id: string;
  text: string;
  photoRequired?: boolean;
  completedAt?: string | null;
  completedByUserId?: string | null;
  proofUrl?: string | null;
}

interface TaskMetadataShape {
  steps?: TaskStepMeta[];
  proofUrls?: string[];
  [key: string]: unknown;
}

function readMetadata(raw: Prisma.JsonValue | null | undefined): TaskMetadataShape {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as TaskMetadataShape;
}

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private async notifyAssignees(taskId: string, title: string, body: string) {
    const assigns = await this.prisma.taskAssignment.findMany({
      where: { taskId },
      select: { userId: true },
    });
    await Promise.allSettled(
      assigns.map((a) =>
        this.notifications.send({
          userId: a.userId,
          channel: NotificationChannel.PUSH,
          title,
          body,
          data: { taskId, kind: 'task' },
        }),
      ),
    );
  }

  async list(filter: { status?: TaskStatus; assigneeId?: string; departmentId?: string; propertyId?: string; companyId?: string } = {}) {
    // TaskItem has no Prisma `property` relation (only the scalar
    // propertyId column), so we can't use `property: { companyId }`
    // in the where clause — it 500s with "Unknown arg". When the
    // caller passes a companyId, resolve it to the company's
    // properties first and turn it into a `propertyId IN […]` filter.
    let propertyIdFilter: { in: string[] } | string | undefined = filter.propertyId;
    if (filter.companyId) {
      const props = await this.prisma.property.findMany({
        where: { companyId: filter.companyId },
        select: { id: true },
      });
      const ids = props.map((p) => p.id);
      // Empty list means "no properties for this company" — narrow to
      // an unsatisfiable filter so we return [] instead of everything.
      propertyIdFilter = filter.propertyId
        ? (ids.includes(filter.propertyId) ? filter.propertyId : { in: [] })
        : { in: ids.length > 0 ? ids : ['__none__'] };
    }

    const where: Prisma.TaskItemWhereInput = {
      ...(filter.status && { status: filter.status }),
      ...(filter.departmentId && { departmentId: filter.departmentId }),
      ...(propertyIdFilter !== undefined && { propertyId: propertyIdFilter as any }),
      ...(filter.assigneeId && { assignees: { some: { userId: filter.assigneeId } } }),
    };

    try {
      // Try the include with user first. If that throws (Prisma client
      // drift / migration mismatch) fall back to assignments-only and
      // hydrate the user records separately so the endpoint never 500s.
      return await this.prisma.taskItem.findMany({
        where,
        include: { assignees: { include: { user: true } } },
        orderBy: [{ createdAt: 'desc' }],
      });
    } catch (e) {
      this.logger.warn(`[tasks.list] include failed: ${e instanceof Error ? e.message : e}`);
    }

    // Fallback: bare assignment rows, then hydrate users in one go.
    const tasks = await this.prisma.taskItem.findMany({
      where,
      include: { assignees: true },
      orderBy: [{ createdAt: 'desc' }],
    });
    const userIds = Array.from(new Set(tasks.flatMap((t) => t.assignees.map((a) => a.userId))));
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, fullName: true, firstName: true, lastName: true, email: true, avatarUrl: true },
        })
      : [];
    const userById = new Map(users.map((u) => [u.id, u]));
    return tasks.map((t) => ({
      ...t,
      assignees: t.assignees.map((a) => ({ ...a, user: userById.get(a.userId) ?? null })),
    }));
  }

  detail(id: string) {
    return this.prisma.taskItem.findUnique({
      where: { id },
      include: {
        assignees: { include: { user: true } },
        department: true,
        createdBy: {
          select: { id: true, fullName: true, firstName: true, lastName: true, email: true, avatarUrl: true },
        },
      },
    });
  }

  async create(dto: Prisma.TaskItemUncheckedCreateInput & { assigneeIds?: string[] }) {
    const { assigneeIds, ...rest } = dto;
    const task = await this.prisma.taskItem.create({
      data: {
        ...rest,
        ...(assigneeIds && {
          assignees: { create: assigneeIds.map((userId) => ({ userId })) },
        }),
      },
      include: { assignees: true },
    });
    if (assigneeIds?.length) {
      void this.notifyAssignees(task.id, 'New task assigned', task.title);
    }
    return task;
  }

  update(id: string, dto: Prisma.TaskItemUncheckedUpdateInput) {
    return this.prisma.taskItem.update({ where: { id }, data: dto });
  }

  setStatus(id: string, status: TaskStatus) {
    const data: any = { status };
    if (status === TaskStatus.DONE) data.completedAt = new Date();
    return this.prisma.taskItem.update({ where: { id }, data });
  }

  remove(id: string) {
    return this.prisma.taskItem.delete({ where: { id } });
  }

  assign(taskId: string, userId: string) {
    return this.prisma.taskAssignment.upsert({
      where: { taskId_userId: { taskId, userId } },
      create: { taskId, userId },
      update: {},
    });
  }

  unassign(taskId: string, userId: string) {
    return this.prisma.taskAssignment.delete({
      where: { taskId_userId: { taskId, userId } },
    });
  }

  /**
   * Replace the task's full assignee set in a single transaction:
   * delete the old assignments, create the new ones. Caller picks who
   * the task should be on after the call — no merging logic.
   */
  async reassign(taskId: string, assigneeIds: string[]) {
    await this.prisma.$transaction([
      this.prisma.taskAssignment.deleteMany({ where: { taskId } }),
      ...assigneeIds.map((userId) =>
        this.prisma.taskAssignment.create({ data: { taskId, userId } }),
      ),
    ]);
    const task = await this.detail(taskId);
    if (assigneeIds.length && task) {
      void this.notifyAssignees(taskId, 'Task reassigned to you', task.title);
    }
    return task;
  }

  /** Toggle a single step in the task's metadata.steps JSON array.
   *  Caller must currently be an assignee on the task. */
  async setStepCompleted(
    taskId: string,
    stepId: string,
    userId: string,
    completed: boolean,
    proofUrl?: string,
  ) {
    const task = await this.prisma.taskItem.findUnique({
      where: { id: taskId },
      include: { assignees: true },
    });
    if (!task) throw new NotFoundException('Task not found');
    const isAssignee = task.assignees.some((a) => a.userId === userId);
    if (!isAssignee) {
      throw new ForbiddenException('Only assignees can mark steps complete');
    }
    const meta = readMetadata(task.metadata);
    const steps = (meta.steps ?? []).map((s) =>
      s.id === stepId
        ? {
            ...s,
            completedAt: completed ? new Date().toISOString() : null,
            completedByUserId: completed ? userId : null,
            proofUrl: proofUrl ?? s.proofUrl ?? null,
          }
        : s,
    );
    return this.prisma.taskItem.update({
      where: { id: taskId },
      data: { metadata: { ...meta, steps } as unknown as Prisma.InputJsonValue },
    });
  }

  async setProofUrls(taskId: string, urls: string[]) {
    const task = await this.prisma.taskItem.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('Task not found');
    const meta = readMetadata(task.metadata);
    return this.prisma.taskItem.update({
      where: { id: taskId },
      data: { metadata: { ...meta, proofUrls: urls } as unknown as Prisma.InputJsonValue },
    });
  }
}
