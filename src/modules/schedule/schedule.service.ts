import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class ScheduleService {
  constructor(private readonly prisma: PrismaService) {}

  list(filter: { userId?: string; propertyId?: string; from?: Date; to?: Date } = {}) {
    return this.prisma.scheduleEntry.findMany({
      where: {
        ...(filter.userId && { userId: filter.userId }),
        ...(filter.propertyId && { propertyId: filter.propertyId }),
        ...(filter.from || filter.to
          ? { startsAt: { ...(filter.from && { gte: filter.from }), ...(filter.to && { lte: filter.to }) } }
          : {}),
      },
      include: { user: true },
      orderBy: { startsAt: 'asc' },
    });
  }

  create(dto: Prisma.ScheduleEntryUncheckedCreateInput) {
    return this.prisma.scheduleEntry.create({ data: dto });
  }

  update(id: string, dto: Prisma.ScheduleEntryUncheckedUpdateInput) {
    return this.prisma.scheduleEntry.update({ where: { id }, data: dto });
  }

  remove(id: string) {
    return this.prisma.scheduleEntry.delete({ where: { id } });
  }
}
