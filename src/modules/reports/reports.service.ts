import { Injectable, Logger } from '@nestjs/common';
import {
  AttendanceStatus,
  BookingStatus,
  LeaveStatus,
  RoomStatus,
  TaskStatus,
  UserRole,
} from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Aggregate read-models that back the dashboard home screens. These
 * are deliberately denormalised (counts and small tallies) so the
 * mobile app makes one cheap GET per dashboard instead of N parallel
 * collection fetches.
 */
@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);
  constructor(private readonly prisma: PrismaService) {}

  /** Admin home — single-company / multi-property tallies.
   *  Every sub-query is wrapped in safeCount/safeRows so a single
   *  broken Prisma call (stale client, missing column on a freshly
   *  reset env, etc.) can never 500 the whole endpoint. The card it
   *  fed just renders 0 / empty in that case. */
  async adminOverview(companyId?: string) {
    const propertyWhere = companyId ? { companyId } : {};
    // TaskItem has no Prisma `property` relation (only the scalar
    // propertyId column), so we can't use `property: { companyId }`
    // — Prisma throws "Unknown arg `property`" and every task count
    // silently zeroes via safeCount. Resolve company → property ids
    // up front and turn it into a propertyId IN […] filter instead.
    let companyPropertyIds: string[] | null = null;
    if (companyId) {
      try {
        const props = await this.prisma.property.findMany({
          where: { companyId },
          select: { id: true },
        });
        companyPropertyIds = props.map((p) => p.id);
      } catch {
        companyPropertyIds = [];
      }
    }
    const taskCompanyWhere = companyPropertyIds === null
      ? {}
      : { propertyId: { in: companyPropertyIds.length > 0 ? companyPropertyIds : ['__none__'] } };
    const userCompanyWhere = companyId ? { companyId } : {};
    const attendanceCompanyWhere = companyId ? { user: { companyId } } : {};
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(startOfToday);
    endOfToday.setDate(endOfToday.getDate() + 1);

    const safeCount = async (label: string, run: () => Promise<number>) => {
      try { return await run(); } catch (e) {
        this.logger.warn(`[adminOverview] ${label} failed: ${e instanceof Error ? e.message : e}`);
        return 0;
      }
    };
    const safeRows = async <T>(label: string, run: () => Promise<T[]>): Promise<T[]> => {
      try { return await run(); } catch (e) {
        this.logger.warn(`[adminOverview] ${label} failed: ${e instanceof Error ? e.message : e}`);
        return [];
      }
    };

    const [
      totalRooms,
      roomsReady,
      roomsInProgress,
      roomsOccupied,
      roomsVacant,
      roomsOutOfService,
      activeTasks,
      completedTasks,
      overdueTasks,
      pendingReviewTasks,
      assignedTodayTasks,
      unassignedTasks,
      totalStaff,
      onShiftNow,
      absentToday,
      staffByDept,
    ] = await Promise.all([
      safeCount('totalRooms', () => this.prisma.room.count({ where: { property: propertyWhere } })),
      safeCount('roomsReady', () => this.prisma.room.count({ where: { property: propertyWhere, status: RoomStatus.AVAILABLE } })),
      safeCount('roomsInProgress', () => this.prisma.room.count({ where: { property: propertyWhere, status: RoomStatus.CLEANING } })),
      safeCount('roomsOccupied', () => this.prisma.room.count({ where: { property: propertyWhere, status: RoomStatus.OCCUPIED } })),
      safeCount('roomsVacant', () => this.prisma.room.count({ where: { property: propertyWhere, status: RoomStatus.MAINTENANCE } })),
      safeCount('roomsOutOfService', () => this.prisma.room.count({ where: { property: propertyWhere, status: RoomStatus.OUT_OF_SERVICE } })),
      safeCount('activeTasks', () => this.prisma.taskItem.count({
        where: { ...taskCompanyWhere, status: { in: [TaskStatus.TODO, TaskStatus.IN_PROGRESS] } },
      })),
      safeCount('completedTasks', () => this.prisma.taskItem.count({ where: { ...taskCompanyWhere, status: TaskStatus.DONE } })),
      safeCount('overdueTasks', () => this.prisma.taskItem.count({
        where: { ...taskCompanyWhere, status: { not: TaskStatus.DONE }, dueAt: { lt: now } },
      })),
      safeCount('pendingReviewTasks', () => this.prisma.taskItem.count({
        where: { ...taskCompanyWhere, status: TaskStatus.BLOCKED },
      })),
      safeCount('assignedTodayTasks', () => this.prisma.taskItem.count({
        where: {
          ...taskCompanyWhere,
          createdAt: { gte: startOfToday, lt: endOfToday },
          assignees: { some: {} },
        },
      })),
      safeCount('unassignedTasks', () => this.prisma.taskItem.count({
        where: {
          ...taskCompanyWhere,
          status: { notIn: [TaskStatus.DONE, TaskStatus.CANCELLED] },
          assignees: { none: {} },
        },
      })),
      safeCount('totalStaff', () => this.prisma.user.count({
        where: { ...userCompanyWhere, deletedAt: null, isHidden: false },
      })),
      safeCount('onShiftNow', () => this.prisma.attendanceEntry.count({
        where: { ...attendanceCompanyWhere, status: AttendanceStatus.CLOCKED_IN },
      })),
      safeCount('absentToday', () => this.prisma.leaveRequest.count({
        where: {
          status: LeaveStatus.APPROVED,
          startDate: { lt: endOfToday },
          endDate: { gte: startOfToday },
          ...(companyId ? { user: { companyId } } : {}),
        },
      })),
      safeRows('staffByDept', () => this.prisma.department.findMany({
        where: companyId ? { companyId } : {},
        select: {
          id: true,
          name: true,
          _count: { select: { members: true } },
        },
        orderBy: { name: 'asc' },
      })),
    ]);

    return {
      property: {
        total: totalRooms,
        ready: roomsReady,
        inProgress: roomsInProgress,
        occupied: roomsOccupied,
        vacant: roomsVacant,
        outOfService: roomsOutOfService,
      },
      tasks: {
        active: activeTasks,
        completed: completedTasks,
        overdue: overdueTasks,
        pendingReview: pendingReviewTasks,
        assignedToday: assignedTodayTasks,
        unassigned: unassignedTasks,
      },
      department: {
        totalStaff,
        onShift: onShiftNow,
        absent: absentToday,
        byDepartment: (staffByDept as Array<{ id: string; name: string; _count: { members: number } }>)
          .map((d) => ({ id: d.id, name: d.name, total: d._count.members })),
      },
    };
  }

  /** Super-user — aggregates across every company the user can see.
   *  For now, scope identically to admin; a future revision can take
   *  a companyIds[] filter. */
  superOverview() {
    return this.adminOverview();
  }

  /** Receptionist home — same shape but scoped to "today" for the
   *  task counters, since receptionists care about their shift. */
  async receptionistOverview(propertyId?: string) {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(startOfToday);
    endOfToday.setDate(endOfToday.getDate() + 1);

    const roomWhere = propertyId ? { propertyId } : {};
    const [
      roomsReady,
      roomsInProgress,
      roomsNeedsAction,
      activeTasks,
      completedToday,
      overdueTasks,
      bookingsArrivingToday,
    ] = await Promise.all([
      this.prisma.room.count({ where: { ...roomWhere, status: RoomStatus.AVAILABLE } }),
      this.prisma.room.count({ where: { ...roomWhere, status: RoomStatus.CLEANING } }),
      this.prisma.room.count({ where: { ...roomWhere, status: RoomStatus.MAINTENANCE } }),
      this.prisma.taskItem.count({
        where: { status: { in: [TaskStatus.TODO, TaskStatus.IN_PROGRESS] } },
      }),
      this.prisma.taskItem.count({
        where: { status: TaskStatus.DONE, completedAt: { gte: startOfToday, lt: endOfToday } },
      }),
      this.prisma.taskItem.count({
        where: { status: { not: TaskStatus.DONE }, dueAt: { lt: new Date() } },
      }),
      this.prisma.booking.count({
        where: {
          checkIn: { gte: startOfToday, lt: endOfToday },
          status: { in: [BookingStatus.CONFIRMED, BookingStatus.PENDING] },
        },
      }),
    ]);

    return {
      rooms: {
        ready: roomsReady,
        inProgress: roomsInProgress,
        needsAction: roomsNeedsAction,
      },
      tasks: {
        active: activeTasks,
        completedToday,
        overdue: overdueTasks,
      },
      arrivalsToday: bookingsArrivingToday,
    };
  }

  /** Supervisor — staff under supervision + their task load. Until the
   *  schema models a supervisor→reportee relationship, scope to the
   *  whole company. */
  async supervisorOverview(_supervisorId: string) {
    const [activeTasks, completedTasks, onShiftNow, staffCount] = await Promise.all([
      this.prisma.taskItem.count({
        where: { status: { in: [TaskStatus.TODO, TaskStatus.IN_PROGRESS] } },
      }),
      this.prisma.taskItem.count({ where: { status: TaskStatus.DONE } }),
      this.prisma.attendanceEntry.count({ where: { status: AttendanceStatus.CLOCKED_IN } }),
      this.prisma.user.count({
        where: { role: UserRole.STAFF, deletedAt: null, isHidden: false },
      }),
    ]);
    return {
      tasks: { active: activeTasks, completed: completedTasks },
      team: { total: staffCount, onShift: onShiftNow },
    };
  }

  /**
   * Property Operator Reports tab data. We aggregate over the last
   * 30 days everywhere except the line chart, which is per-day for
   * the last 7 days. The `companyId` filter is reserved — once we
   * model property scoping on tasks we'll restrict here too. For now
   * it's scoped to the whole company, same as adminOverview.
   */
  async adminCharts(companyId?: string, departmentId?: string) {
    const now = new Date();
    const startOf30 = new Date(now);
    startOf30.setDate(startOf30.getDate() - 30);

    // Company scope: tasks via task.property.companyId; departments
    // directly. Department filter narrows tasks further.
    const taskScope = companyId ? { property: { companyId } } : {};
    const deptScope = companyId ? { companyId } : {};
    const taskWithDept = (extra: object) => ({
      ...taskScope,
      ...(departmentId ? { departmentId } : {}),
      ...extra,
    });

    const [
      totalJobs,
      completedJobs,
      pendingJobs,
      jobsLast7Days,
      departments,
    ] = await Promise.all([
      this.prisma.taskItem.count({ where: taskWithDept({ createdAt: { gte: startOf30 } }) }),
      this.prisma.taskItem.count({
        where: taskWithDept({ status: TaskStatus.DONE, completedAt: { gte: startOf30 } }),
      }),
      this.prisma.taskItem.count({
        where: taskWithDept({ status: { in: [TaskStatus.TODO, TaskStatus.IN_PROGRESS] } }),
      }),
      this.dailyCompletedSeries(7, companyId, departmentId),
      this.prisma.department.findMany({
        where: deptScope,
        orderBy: { name: 'asc' },
        take: 6,
      }),
    ]);

    const performanceByDepartment = await Promise.all(
      departments.map(async (d) => {
        const [total, completed] = await Promise.all([
          this.prisma.taskItem.count({
            where: { ...taskScope, departmentId: d.id, createdAt: { gte: startOf30 } },
          }),
          this.prisma.taskItem.count({
            where: {
              ...taskScope,
              departmentId: d.id,
              status: TaskStatus.DONE,
              completedAt: { gte: startOf30 },
            },
          }),
        ]);
        const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
        return { id: d.id, name: d.name, rate };
      }),
    );

    const overallRate = totalJobs > 0 ? Math.round((completedJobs / totalJobs) * 100) : 0;

    return {
      operations: {
        totalJobs,
        completed: completedJobs,
        pending: pendingJobs,
      },
      jobsLast7Days,
      performanceByDepartment,
      performanceRate: overallRate,
    };
  }

  /** 7-point series: completed task count per day for the last `days`
   *  days, oldest first. Scoped to companyId + optional departmentId. */
  private async dailyCompletedSeries(days: number, companyId?: string, departmentId?: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const out: { day: string; count: number }[] = [];
    const baseScope = {
      ...(companyId ? { property: { companyId } } : {}),
      ...(departmentId ? { departmentId } : {}),
    };
    for (let i = days - 1; i >= 0; i--) {
      const start = new Date(today);
      start.setDate(start.getDate() - i);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      const count = await this.prisma.taskItem.count({
        where: {
          ...baseScope,
          status: TaskStatus.DONE,
          completedAt: { gte: start, lt: end },
        },
      });
      out.push({ day: start.toISOString().slice(0, 10), count });
    }
    return out;
  }
}
