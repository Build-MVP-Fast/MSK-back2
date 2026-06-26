import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { LeaveStatus, LeaveType, Prisma } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';

export interface CreateLeaveDto {
  startDate: string;
  endDate: string;
  type?: LeaveType;
  reason?: string;
}

export interface ReviewLeaveDto {
  status: 'APPROVED' | 'REJECTED';
  reviewerNote?: string;
}

@Injectable()
export class LeaveService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateLeaveDto) {
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException('Invalid start or end date.');
    }
    if (end < start) {
      throw new BadRequestException('End date must be on or after the start date.');
    }
    return this.prisma.leaveRequest.create({
      data: {
        userId,
        startDate: start,
        endDate: end,
        type: dto.type ?? LeaveType.PERSONAL,
        reason: dto.reason,
      },
    });
  }

  /** Caller's own leave history. */
  mine(userId: string) {
    return this.prisma.leaveRequest.findMany({
      where: { userId },
      orderBy: { startDate: 'desc' },
      take: 100,
    });
  }

  /** Manager / admin view — every team member's leave, optionally filtered. */
  list(filter: { status?: LeaveStatus; userId?: string; companyId?: string } = {}) {
    return this.prisma.leaveRequest.findMany({
      where: {
        ...(filter.status && { status: filter.status }),
        ...(filter.userId && { userId: filter.userId }),
        // Tenant scope: only leaves filed by staff in the operator's
        // company. Without this every Property Operator on the
        // platform sees every other operator's leave requests.
        ...(filter.companyId && { user: { companyId: filter.companyId } }),
      },
      include: {
        user: { select: { id: true, fullName: true, role: true, avatarUrl: true } },
        reviewer: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async cancel(id: string, requesterId: string) {
    const row = await this.prisma.leaveRequest.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Leave request not found');
    if (row.userId !== requesterId) {
      throw new ForbiddenException('You can only cancel your own leave requests.');
    }
    if (row.status !== LeaveStatus.PENDING) {
      throw new BadRequestException('Only pending requests can be cancelled.');
    }
    return this.prisma.leaveRequest.update({
      where: { id },
      data: { status: LeaveStatus.CANCELLED },
    });
  }

  async review(id: string, reviewerId: string, dto: ReviewLeaveDto, reviewerCompanyId?: string) {
    const row = await this.prisma.leaveRequest.findUnique({
      where: { id },
      include: { user: { select: { companyId: true } } },
    });
    if (!row) throw new NotFoundException('Leave request not found');
    if (row.status !== LeaveStatus.PENDING) {
      throw new BadRequestException('Only pending requests can be reviewed.');
    }
    // Tenant guard: ADMIN-tier callers can only approve/reject leaves
    // filed by staff in their own company. Without it, operator A
    // could approve operator B's staff's leave by guessing the UUID.
    if (reviewerCompanyId && row.user?.companyId && row.user.companyId !== reviewerCompanyId) {
      throw new ForbiddenException('Not your team');
    }
    const status =
      dto.status === 'APPROVED' ? LeaveStatus.APPROVED : LeaveStatus.REJECTED;
    return this.prisma.leaveRequest.update({
      where: { id },
      data: {
        status,
        reviewerId,
        reviewerNote: dto.reviewerNote,
        reviewedAt: new Date(),
      } as Prisma.LeaveRequestUncheckedUpdateInput,
    });
  }
}
