import { Injectable } from '@nestjs/common';
import { Prisma, RequestStatus } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class RequestsService {
  constructor(private readonly prisma: PrismaService) {}

  list(filter: { status?: RequestStatus; assignedToId?: string; requestedById?: string } = {}) {
    return this.prisma.guestRequest.findMany({
      where: {
        ...(filter.status && { status: filter.status }),
        ...(filter.assignedToId && { assignedToId: filter.assignedToId }),
        ...(filter.requestedById && { requestedById: filter.requestedById }),
      },
      include: { requestedBy: true, assignedTo: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(dto: Prisma.GuestRequestUncheckedCreateInput) {
    return this.prisma.guestRequest.create({ data: dto });
  }

  update(id: string, dto: Prisma.GuestRequestUncheckedUpdateInput) {
    return this.prisma.guestRequest.update({ where: { id }, data: dto });
  }

  resolve(id: string) {
    return this.prisma.guestRequest.update({
      where: { id },
      data: { status: RequestStatus.RESOLVED, resolvedAt: new Date() },
    });
  }

  assign(id: string, userId: string) {
    return this.prisma.guestRequest.update({
      where: { id },
      data: { assignedToId: userId, status: RequestStatus.IN_PROGRESS },
    });
  }
}
