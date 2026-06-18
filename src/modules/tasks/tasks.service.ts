import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TaskStatus } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';

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
  constructor(private readonly prisma: PrismaService) {}

  list(filter: { status?: TaskStatus; assigneeId?: string; departmentId?: string; propertyId?: string } = {}) {
    return this.prisma.taskItem.findMany({
      where: {
        ...(filter.status && { status: filter.status }),
        ...(filter.departmentId && { departmentId: filter.departmentId }),
        ...(filter.propertyId && { propertyId: filter.propertyId }),
        ...(filter.assigneeId && { assignees: { some: { userId: filter.assigneeId } } }),
      },
      include: { assignees: { include: { user: true } } },
      orderBy: [{ priority: 'desc' }, { dueAt: 'asc' }],
    });
  }

  detail(id: string) {
    return this.prisma.taskItem.findUnique({
      where: { id },
      include: { assignees: { include: { user: true } }, department: true },
    });
  }

  create(dto: Prisma.TaskItemUncheckedCreateInput & { assigneeIds?: string[] }) {
    const { assigneeIds, ...rest } = dto;
    return this.prisma.taskItem.create({
      data: {
        ...rest,
        ...(assigneeIds && {
          assignees: { create: assigneeIds.map((userId) => ({ userId })) },
        }),
      },
      include: { assignees: true },
    });
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
    return this.detail(taskId);
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
