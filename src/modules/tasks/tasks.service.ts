import { Injectable } from '@nestjs/common';
import { Prisma, TaskStatus } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';

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
}
