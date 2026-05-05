import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { AvailabilityBlockReason, Prisma } from '@prisma/client';
import dayjs from 'dayjs';

import { PrismaService } from '../../common/prisma/prisma.service';

interface AvailabilityQuery {
  propertyId: string;
  roomTypeId?: string;
  roomId?: string;
  from: Date;
  to: Date;
}

@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns availability for a property between two dates, broken down by day.
   * Combines AvailabilityCalendarEntry rows with active AvailabilityBlock ranges.
   */
  async getCalendar(query: AvailabilityQuery) {
    if (dayjs(query.to).isBefore(query.from)) {
      throw new BadRequestException('"to" must be after "from"');
    }

    const where: Prisma.AvailabilityCalendarEntryWhereInput = {
      propertyId: query.propertyId,
      ...(query.roomTypeId && { roomTypeId: query.roomTypeId }),
      ...(query.roomId && { roomId: query.roomId }),
      date: { gte: query.from, lte: query.to },
    };

    const [entries, blocks] = await Promise.all([
      this.prisma.availabilityCalendarEntry.findMany({ where, orderBy: { date: 'asc' } }),
      this.prisma.availabilityBlock.findMany({
        where: {
          propertyId: query.propertyId,
          ...(query.roomId && { roomId: query.roomId }),
          startDate: { lte: query.to },
          endDate: { gte: query.from },
        },
      }),
    ]);

    return { entries, blocks };
  }

  /** Atomic check + reserve. Returns true if inventory was successfully decremented. */
  async tryReserve(opts: {
    propertyId: string;
    roomTypeId?: string;
    roomId?: string;
    checkIn: Date;
    checkOut: Date;
    units?: number;
  }) {
    const units = opts.units ?? 1;
    return this.prisma.$transaction(async (tx) => {
      const days = enumerateDays(opts.checkIn, opts.checkOut);
      // Lock-and-check each affected day
      const entries = await tx.availabilityCalendarEntry.findMany({
        where: {
          propertyId: opts.propertyId,
          ...(opts.roomTypeId && { roomTypeId: opts.roomTypeId }),
          ...(opts.roomId && { roomId: opts.roomId }),
          date: { in: days },
        },
      });

      for (const day of days) {
        const entry = entries.find((e) => sameDay(e.date, day));
        const available = entry ? entry.inventory - entry.reserved : 1;
        if (available < units) {
          throw new ConflictException(
            `No availability for ${day.toISOString().slice(0, 10)}`,
          );
        }
      }

      // Reserve
      for (const day of days) {
        const entry = entries.find((e) => sameDay(e.date, day));
        if (entry) {
          await tx.availabilityCalendarEntry.update({
            where: { id: entry.id },
            data: { reserved: { increment: units } },
          });
        } else {
          await tx.availabilityCalendarEntry.create({
            data: {
              propertyId: opts.propertyId,
              roomTypeId: opts.roomTypeId,
              roomId: opts.roomId,
              date: day,
              inventory: 1,
              reserved: units,
            },
          });
        }
      }
      return true;
    });
  }

  /** Release inventory previously reserved by tryReserve. */
  async release(opts: {
    propertyId: string;
    roomTypeId?: string;
    roomId?: string;
    checkIn: Date;
    checkOut: Date;
    units?: number;
  }) {
    const units = opts.units ?? 1;
    const days = enumerateDays(opts.checkIn, opts.checkOut);
    return this.prisma.availabilityCalendarEntry.updateMany({
      where: {
        propertyId: opts.propertyId,
        ...(opts.roomTypeId && { roomTypeId: opts.roomTypeId }),
        ...(opts.roomId && { roomId: opts.roomId }),
        date: { in: days },
      },
      data: { reserved: { decrement: units } },
    });
  }

  blockDates(opts: {
    propertyId: string;
    roomId?: string;
    startDate: Date;
    endDate: Date;
    reason: AvailabilityBlockReason;
    notes?: string;
    bookingId?: string;
  }) {
    return this.prisma.availabilityBlock.create({ data: opts });
  }

  unblockDates(blockId: string) {
    return this.prisma.availabilityBlock.delete({ where: { id: blockId } });
  }

  /**
   * Bulk-upsert calendar entries for a property at the room-type level
   * (roomId is always null on the entries we touch here — physical-room
   * overrides are managed elsewhere).
   *
   * Note: we don't use Prisma's `upsert` with the compound unique key
   * because the key includes nullable columns (roomTypeId, roomId) and
   * Postgres treats NULL as distinct in unique indexes — the upsert can't
   * match an existing row. Instead we findFirst → update / create inside
   * a single transaction.
   */
  async bulkUpsertCalendar(
    propertyId: string,
    entries: {
      roomTypeId: string;
      date: Date;
      inventory?: number;
      price?: number;
      currency?: string;
      closeOut?: boolean;
      minStay?: number;
      maxStay?: number;
    }[],
  ) {
    return this.prisma.$transaction(async (tx) => {
      const results = [];
      for (const e of entries) {
        const day = utcMidnight(e.date);
        const existing = await tx.availabilityCalendarEntry.findFirst({
          where: {
            propertyId,
            roomTypeId: e.roomTypeId,
            roomId: null,
            date: day,
          },
        });

        const data = {
          inventory: e.inventory,
          price: e.price,
          currency: e.currency,
          closeOut: e.closeOut,
          minStay: e.minStay,
          maxStay: e.maxStay,
        };

        if (existing) {
          results.push(
            await tx.availabilityCalendarEntry.update({
              where: { id: existing.id },
              data,
            }),
          );
        } else {
          results.push(
            await tx.availabilityCalendarEntry.create({
              data: {
                propertyId,
                roomTypeId: e.roomTypeId,
                date: day,
                // Sensible default — if the admin didn't pass inventory,
                // assume 1 unit per day so the entry is meaningful.
                inventory: e.inventory ?? 1,
                price: e.price,
                currency: e.currency,
                closeOut: e.closeOut ?? false,
                minStay: e.minStay,
                maxStay: e.maxStay,
              },
            }),
          );
        }
      }
      return results;
    });
  }

  listBlocks(propertyId: string, from: Date, to: Date) {
    return this.prisma.availabilityBlock.findMany({
      where: {
        propertyId,
        startDate: { lte: to },
        endDate: { gte: from },
      },
      include: { room: { select: { id: true, number: true, roomTypeId: true } } },
      orderBy: { startDate: 'asc' },
    });
  }

  /**
   * Public per-day availability per room type for a date range. Used by the
   * website's date picker → Available rooms gallery.
   *
   * For each (room type × day) we report:
   *   available = inventory − reserved (or 0 if blocked / closed out)
   *   price     = calendar entry price, falling back to RoomType.basePrice
   *
   * Block resolution: a room type is blocked for a day if either
   *   (a) a property-level block (roomId IS NULL) covers that day, or
   *   (b) every physical room of this type is blocked that day.
   * The check is intentionally pessimistic — overstating "blocked" can't
   * cause an over-booking, only a missed sale.
   */
  async publicAvailability(propertyId: string, from: Date, to: Date) {
    if (dayjs(to).isBefore(from)) {
      throw new BadRequestException('"to" must be on or after "from"');
    }

    const fromDay = utcMidnight(from);
    const toDay = utcMidnight(to);

    // For nightly stays the "to" date is the checkout day (exclusive). If
    // the request is from===to, return zero days.
    const days = enumerateDays(fromDay, toDay);

    // Load everything needed in parallel.
    const [roomTypes, entries, blocks] = await Promise.all([
      this.prisma.roomType.findMany({
        where: { propertyId },
        select: {
          id: true,
          basePrice: true,
          currency: true,
          rooms: { select: { id: true } },
        },
        orderBy: { ordering: 'asc' },
      }),
      this.prisma.availabilityCalendarEntry.findMany({
        where: {
          propertyId,
          roomId: null,
          date: { gte: fromDay, lte: toDay },
        },
      }),
      this.prisma.availabilityBlock.findMany({
        where: {
          propertyId,
          startDate: { lte: toDay },
          endDate: { gte: fromDay },
        },
        select: {
          roomId: true,
          startDate: true,
          endDate: true,
          reason: true,
        },
      }),
    ]);

    const propertyBlocks = blocks.filter((b) => b.roomId === null);
    const roomBlocks = blocks.filter((b) => b.roomId !== null);

    const roomTypePayload = roomTypes.map((rt) => {
      const roomIds = rt.rooms.map((r) => r.id);

      const dayPayload = days.map((day) => {
        const entry = entries.find(
          (e) => e.roomTypeId === rt.id && sameDay(e.date, day),
        );

        // UTC timestamp comparison — blocks come back as UTC midnight from
        // the @db.Date column; comparing against the enumerated UTC days
        // gives stable, TZ-agnostic membership.
        const dayTs = day.getTime();
        const inBlock = (b: { startDate: Date; endDate: Date }) =>
          dayTs >= utcMidnight(b.startDate).getTime() &&
          dayTs <= utcMidnight(b.endDate).getTime();

        const propertyBlocked = propertyBlocks.some(inBlock);
        const allRoomsBlocked =
          roomIds.length > 0 &&
          roomIds.every((roomId) =>
            roomBlocks.some((b) => b.roomId === roomId && inBlock(b)),
          );
        const blocked = propertyBlocked || allRoomsBlocked;
        const closeOut = entry?.closeOut ?? false;

        const inventory = entry?.inventory ?? 1;
        const reserved = entry?.reserved ?? 0;
        const available =
          blocked || closeOut ? 0 : Math.max(0, inventory - reserved);

        const rawPrice = entry?.price ?? rt.basePrice;
        const price = Number(rawPrice);
        const currency = entry?.currency ?? rt.currency;

        return {
          date: day.toISOString().slice(0, 10),
          available,
          price,
          currency,
          blocked,
          closeOut,
          minStay: entry?.minStay ?? null,
          maxStay: entry?.maxStay ?? null,
        };
      });

      return {
        roomTypeId: rt.id,
        defaultPrice: Number(rt.basePrice),
        currency: rt.currency,
        days: dayPayload,
      };
    });

    return {
      from: fromDay.toISOString().slice(0, 10),
      to: toDay.toISOString().slice(0, 10),
      nights: days.length,
      roomTypes: roomTypePayload,
    };
  }
}

// UTC-safe date helpers. The DB stores @db.Date columns as midnight UTC; we
// must match that frame on the JS side or one date will silently drift on
// non-UTC servers (e.g. local dev on Windows). dayjs without the utc plugin
// uses local time, so we don't lean on it for these comparisons.

function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function enumerateDays(from: Date, to: Date): Date[] {
  const days: Date[] = [];
  const start = utcMidnight(from).getTime();
  const end = utcMidnight(to).getTime();
  // Half-open interval [from, to) — `to` is the checkout day, not a stayed
  // night. enumerateDaysInclusive below handles the closed-interval case.
  for (let t = start; t < end; t += 86400000) {
    days.push(new Date(t));
  }
  return days;
}

function sameDay(a: Date, b: Date): boolean {
  // Both args are expected to be UTC midnights (DB-issued or explicitly
  // normalised). String compare on the UTC date portion is TZ-safe.
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}
