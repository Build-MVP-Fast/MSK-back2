import { Injectable } from '@nestjs/common';
import {
  AttendanceStatus,
  BookingStatus,
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
  constructor(private readonly prisma: PrismaService) {}

  /** Admin home — single-company / multi-property tallies. */
  async adminOverview(companyId?: string) {
    const propertyWhere = companyId ? { companyId } : {};
    const [
      totalRooms,
      roomsReady,
      roomsInProgress,
      roomsOccupied,
      roomsVacant,
      activeTasks,
      completedTasks,
      overdueTasks,
      totalStaff,
      onShiftNow,
    ] = await Promise.all([
      this.prisma.room.count({ where: { property: propertyWhere } }),
      this.prisma.room.count({ where: { property: propertyWhere, status: RoomStatus.AVAILABLE } }),
      this.prisma.room.count({ where: { property: propertyWhere, status: RoomStatus.CLEANING } }),
      this.prisma.room.count({ where: { property: propertyWhere, status: RoomStatus.OCCUPIED } }),
      this.prisma.room.count({ where: { property: propertyWhere, status: RoomStatus.MAINTENANCE } }),
      this.prisma.taskItem.count({ where: { status: { in: [TaskStatus.TODO, TaskStatus.IN_PROGRESS] } } }),
      this.prisma.taskItem.count({ where: { status: TaskStatus.DONE } }),
      this.prisma.taskItem.count({
        where: { status: { not: TaskStatus.DONE }, dueAt: { lt: new Date() } },
      }),
      this.prisma.user.count({
        where: { ...(companyId ? { companyId } : {}), deletedAt: null, isHidden: false },
      }),
      this.prisma.attendanceEntry.count({ where: { status: AttendanceStatus.CLOCKED_IN } }),
    ]);

    return {
      property: {
        total: totalRooms,
        ready: roomsReady,
        inProgress: roomsInProgress,
        occupied: roomsOccupied,
        vacant: roomsVacant,
      },
      tasks: {
        active: activeTasks,
        completed: completedTasks,
        overdue: overdueTasks,
      },
      department: {
        totalStaff,
        onShift: onShiftNow,
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
}
