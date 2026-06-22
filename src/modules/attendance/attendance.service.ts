import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AttendanceStatus } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Open a new attendance entry. Rejects if the user already has an
   * open punch — they must clock out (or have it auto-closed) first.
   */
  async clockIn(userId: string, geo?: { lat?: number; lng?: number }) {
    const open = await this.prisma.attendanceEntry.findFirst({
      where: { userId, status: AttendanceStatus.CLOCKED_IN },
    });
    if (open) {
      throw new BadRequestException('You are already clocked in.');
    }
    return this.prisma.attendanceEntry.create({
      data: {
        userId,
        clockInAt: new Date(),
        clockInLat: geo?.lat,
        clockInLng: geo?.lng,
      },
    });
  }

  async clockOut(
    userId: string,
    note?: string,
    geo?: { lat?: number; lng?: number },
  ) {
    const open = await this.prisma.attendanceEntry.findFirst({
      where: { userId, status: AttendanceStatus.CLOCKED_IN },
      orderBy: { clockInAt: 'desc' },
    });
    if (!open) {
      throw new BadRequestException('You are not currently clocked in.');
    }
    return this.prisma.attendanceEntry.update({
      where: { id: open.id },
      data: {
        clockOutAt: new Date(),
        status: AttendanceStatus.CLOCKED_OUT,
        clockOutNote: note,
        clockOutLat: geo?.lat,
        clockOutLng: geo?.lng,
      },
    });
  }

  /** Returns the user's currently-open punch (if any) so the mobile
   *  app can render the right clock-in/out button on launch. */
  current(userId: string) {
    return this.prisma.attendanceEntry.findFirst({
      where: { userId, status: AttendanceStatus.CLOCKED_IN },
      orderBy: { clockInAt: 'desc' },
    });
  }

  /** Paginated history for a single user. Default window = last 30 days. */
  history(userId: string, opts: { from?: Date; to?: Date } = {}) {
    const from = opts.from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = opts.to ?? new Date();
    return this.prisma.attendanceEntry.findMany({
      where: {
        userId,
        clockInAt: { gte: from, lte: to },
      },
      orderBy: { clockInAt: 'desc' },
      take: 200,
    });
  }

  /** Aggregate summary for the same window — total days, total worked
   *  time (ms), and the average per day. */
  async summary(userId: string, opts: { from?: Date; to?: Date } = {}) {
    const rows = await this.history(userId, opts);
    const closed = rows.filter((r) => r.clockOutAt);
    const totalMs = closed.reduce(
      (acc, r) => acc + (r.clockOutAt!.getTime() - r.clockInAt.getTime()),
      0,
    );
    const days = new Set(
      closed.map((r) => r.clockInAt.toISOString().slice(0, 10)),
    ).size;
    return {
      days,
      totalMs,
      averageMs: days > 0 ? Math.round(totalMs / days) : 0,
      sessions: closed.length,
    };
  }

  /** Supervisor / admin view — paged list across users. */
  list(filter: { userId?: string; from?: Date; to?: Date; companyId?: string } = {}) {
    return this.prisma.attendanceEntry.findMany({
      where: {
        ...(filter.userId && { userId: filter.userId }),
        ...(filter.companyId && { user: { companyId: filter.companyId } }),
        ...(filter.from || filter.to
          ? {
              clockInAt: {
                ...(filter.from && { gte: filter.from }),
                ...(filter.to && { lte: filter.to }),
              },
            }
          : {}),
      },
      include: { user: { select: { id: true, fullName: true, role: true } } },
      orderBy: { clockInAt: 'desc' },
      take: 200,
    });
  }

  async detail(id: string) {
    const row = await this.prisma.attendanceEntry.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Attendance entry not found');
    return row;
  }
}
