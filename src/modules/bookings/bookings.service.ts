import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AvailabilityBlockReason,
  BookingSource,
  BookingStatus,
  Prisma,
} from '@prisma/client';
import { nanoid } from 'nanoid';

import { PrismaService } from '../../common/prisma/prisma.service';
import { AvailabilityService } from '../availability/availability.service';
import { EmailService } from '../notifications/email.service';

interface CreateBookingInput {
  propertyId: string;
  roomTypeId: string;
  roomId?: string;
  guestUserId?: string;
  guestEmail?: string;
  guestPhone?: string;
  guestFirstName?: string;
  guestLastName?: string;
  adults?: number;
  children?: number;
  /** Date or YYYY-MM-DD string. */
  checkIn: Date | string;
  checkOut: Date | string;
  source?: BookingSource;
  specialRequests?: string;
}

interface ListFilter {
  status?: BookingStatus;
  propertyId?: string;
  source?: BookingSource;
  userId?: string;
  checkInFrom?: Date;
  checkInTo?: Date;
  q?: string;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: AvailabilityService,
    private readonly email: EmailService,
  ) {}

  /**
   * Atomically reserves availability and creates a booking.
   *
   * Total is computed on the server from the room type's calendar entries
   * (with basePrice fallback) — we never trust a client-supplied total
   * since the booking endpoint is public.
   *
   * Throws ConflictException via AvailabilityService.tryReserve if the
   * dates aren't available.
   */
  async create(input: CreateBookingInput) {
    const checkIn = utcMidnight(input.checkIn);
    const checkOut = utcMidnight(input.checkOut);
    const nights = Math.round((checkOut.getTime() - checkIn.getTime()) / 86400000);
    if (nights <= 0) {
      throw new BadRequestException('checkOut must be after checkIn');
    }

    const roomType = await this.prisma.roomType.findUnique({
      where: { id: input.roomTypeId },
      select: {
        id: true,
        propertyId: true,
        basePrice: true,
        currency: true,
        property: { select: { name: true } },
      },
    });
    if (!roomType) throw new NotFoundException('Room type not found');
    if (roomType.propertyId !== input.propertyId) {
      throw new BadRequestException('Room type does not belong to property');
    }

    // Compute total from per-day calendar entries (room-type level), falling
    // back to the room type's basePrice for any night without an entry.
    const days = enumerateDays(checkIn, checkOut);
    const entries = await this.prisma.availabilityCalendarEntry.findMany({
      where: {
        propertyId: input.propertyId,
        roomTypeId: input.roomTypeId,
        roomId: null,
        date: { in: days },
      },
      select: { date: true, price: true, currency: true },
    });
    const basePrice = Number(roomType.basePrice);
    let totalAmount = 0;
    let currency = roomType.currency;
    for (const day of days) {
      const entry = entries.find((e) => sameDay(e.date, day));
      const nightly = entry?.price != null ? Number(entry.price) : basePrice;
      totalAmount += nightly;
      if (entry?.currency) currency = entry.currency;
    }

    // Reserve first — throws ConflictException with a clear message if any
    // night is unavailable. Doing this BEFORE the booking insert keeps us
    // from leaving an orphaned booking row on conflict.
    await this.availability.tryReserve({
      propertyId: input.propertyId,
      roomTypeId: input.roomTypeId,
      roomId: input.roomId,
      checkIn,
      checkOut,
    });

    const booking = await this.prisma.$transaction(async (tx) => {
      const created = await tx.booking.create({
        data: {
          reference: generateReference(),
          propertyId: input.propertyId,
          roomTypeId: input.roomTypeId,
          roomId: input.roomId,
          guestUserId: input.guestUserId,
          guestEmail: input.guestEmail,
          guestPhone: input.guestPhone,
          guestFirstName: input.guestFirstName,
          guestLastName: input.guestLastName,
          adults: input.adults ?? 1,
          children: input.children ?? 0,
          checkIn,
          checkOut,
          nights,
          totalAmount,
          currency,
          source: input.source ?? BookingSource.WEBSITE,
          status: BookingStatus.PENDING,
          specialRequests: input.specialRequests,
        },
      });

      // Hard-block the dates against further bookings. Linked to the
      // booking so cancel can also clean it up.
      await tx.availabilityBlock.create({
        data: {
          propertyId: input.propertyId,
          roomId: input.roomId,
          startDate: checkIn,
          endDate: checkOut,
          reason: AvailabilityBlockReason.BOOKING,
          bookingId: created.id,
        },
      });

      return created;
    });

    // Confirmation email — fire and forget. Failures shouldn't block the
    // booking response.
    if (booking.guestEmail) {
      void this.sendConfirmationEmail(booking, roomType.property.name).catch(
        (err) =>
          this.logger.warn(
            `Failed to send confirmation email for ${booking.reference}: ${err}`,
          ),
      );
    }

    return booking;
  }

  // ── List + detail ──────────────────────────────────────────────────────

  async list(filter: ListFilter = {}) {
    const page = filter.page ?? 1;
    const pageSize = Math.min(filter.pageSize ?? 20, 100);

    const where: Prisma.BookingWhereInput = {
      ...(filter.status && { status: filter.status }),
      ...(filter.propertyId && { propertyId: filter.propertyId }),
      ...(filter.source && { source: filter.source }),
      ...(filter.userId && { guestUserId: filter.userId }),
      ...((filter.checkInFrom || filter.checkInTo) && {
        checkIn: {
          ...(filter.checkInFrom && { gte: filter.checkInFrom }),
          ...(filter.checkInTo && { lte: filter.checkInTo }),
        },
      }),
      ...(filter.q && {
        OR: [
          { reference: { contains: filter.q, mode: 'insensitive' } },
          { guestEmail: { contains: filter.q, mode: 'insensitive' } },
          { guestFirstName: { contains: filter.q, mode: 'insensitive' } },
          { guestLastName: { contains: filter.q, mode: 'insensitive' } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          property: { select: { id: true, name: true, slug: true } },
          room: { select: { id: true, number: true } },
        },
      }),
      this.prisma.booking.count({ where }),
    ]);

    return {
      data: items,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async detail(id: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        property: true,
        room: { include: { roomType: true } },
        bookingGuests: true,
        payments: true,
        invoices: true,
      },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    return booking;
  }

  /**
   * Public lookup by reference + guest email. Used by the website's
   * confirmation page (only by reference) and by a "find your reservation"
   * flow (reference + email match).
   */
  async findByReference(reference: string, email?: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { reference },
      include: {
        property: { select: { id: true, name: true, slug: true } },
        room: {
          select: {
            id: true,
            number: true,
            roomType: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (
      email &&
      booking.guestEmail &&
      booking.guestEmail.toLowerCase() !== email.toLowerCase()
    ) {
      throw new NotFoundException('Booking not found');
    }
    return booking;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  async cancel(id: string, reason?: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.status === BookingStatus.CANCELLED) return booking;

    await this.availability.release({
      propertyId: booking.propertyId,
      roomTypeId: booking.roomTypeId ?? undefined,
      roomId: booking.roomId ?? undefined,
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
    });

    // Drop the BOOKING-reason block so the dates show as available again
    // on the public availability endpoint.
    await this.prisma.availabilityBlock.deleteMany({
      where: { bookingId: id, reason: AvailabilityBlockReason.BOOKING },
    });

    return this.prisma.booking.update({
      where: { id },
      data: {
        status: BookingStatus.CANCELLED,
        cancellationReason: reason,
        cancelledAt: new Date(),
      },
    });
  }

  checkIn(id: string) {
    return this.prisma.booking.update({
      where: { id },
      data: { status: BookingStatus.CHECKED_IN, checkedInAt: new Date() },
    });
  }

  checkOut(id: string) {
    return this.prisma.booking.update({
      where: { id },
      data: { status: BookingStatus.CHECKED_OUT, checkedOutAt: new Date() },
    });
  }

  update(id: string, dto: Prisma.BookingUncheckedUpdateInput) {
    return this.prisma.booking.update({ where: { id }, data: dto });
  }

  /**
   * Pin a booking to a specific physical room — or unassign by passing
   * roomId = null. Receptionists do this as guests arrive ("Smith party
   * is checking in, give them Room 203"). Rules enforced:
   *
   *   1. Booking must exist and not be in a terminal state (CANCELLED /
   *      CHECKED_OUT). Unassigning a terminal booking is still blocked —
   *      they're frozen.
   *   2. If roomId is null, just clear the assignment.
   *   3. Otherwise the room must belong to the same property AND room
   *      type as the booking (you can't put a Suite guest in a Studio).
   *   4. The room must not already be assigned to another active
   *      booking whose [checkIn, checkOut) overlaps this booking's
   *      window. Active = status NOT IN (CANCELLED, NO_SHOW). 409 on
   *      conflict.
   */
  async assignRoom(bookingId: string, roomId: string | null) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        propertyId: true,
        roomTypeId: true,
        status: true,
        checkIn: true,
        checkOut: true,
      },
    });
    if (!booking) throw new NotFoundException('Booking not found');

    if (
      booking.status === BookingStatus.CANCELLED ||
      booking.status === BookingStatus.CHECKED_OUT
    ) {
      throw new BadRequestException(
        `Cannot change the room assignment of a ${booking.status.toLowerCase().replace('_', ' ')} booking.`,
      );
    }

    if (roomId !== null && roomId !== undefined) {
      const room = await this.prisma.room.findUnique({
        where: { id: roomId },
        select: { id: true, number: true, propertyId: true, roomTypeId: true },
      });
      if (!room) throw new NotFoundException('Room not found');

      if (room.propertyId !== booking.propertyId) {
        throw new BadRequestException(
          'That room belongs to a different property.',
        );
      }
      if (room.roomTypeId !== booking.roomTypeId) {
        throw new BadRequestException(
          'That room is a different room type than this booking.',
        );
      }

      // Overlap check: any active booking on the same room that shares any
      // date with [booking.checkIn, booking.checkOut) is a conflict.
      // checkOut is exclusive — Room can be reused on the checkout day.
      const conflict = await this.prisma.booking.findFirst({
        where: {
          id: { not: bookingId },
          roomId,
          status: { notIn: [BookingStatus.CANCELLED, BookingStatus.NO_SHOW] },
          AND: [
            { checkIn: { lt: booking.checkOut } },
            { checkOut: { gt: booking.checkIn } },
          ],
        },
        select: { reference: true, checkIn: true, checkOut: true },
      });
      if (conflict) {
        throw new ConflictException(
          `Room ${room.number} is already on booking ${conflict.reference} for overlapping dates.`,
        );
      }
    }

    // Booking has a Room relation but `roomType` is stored as id only on
    // this schema (no FK relation back). The frontend hydrates room-type
    // metadata from its existing room-type fetch, so we only need the
    // assigned room here.
    return this.prisma.booking.update({
      where: { id: bookingId },
      data: { roomId: roomId ?? null },
      include: {
        room: { select: { id: true, number: true, floor: true } },
      },
    });
  }

  /**
   * Calendar/Gantt view: every room in the property + every active
   * booking touching the [from, to) window, returned in a shape the UI
   * can drop straight into rows × days. Unassigned bookings come back
   * separately so the UI can show them in a dedicated lane.
   *
   * `to` must be at most 90 days after `from` — caps the worst case.
   */
  async calendar(propertyId: string, from: Date, to: Date) {
    const days = Math.ceil((to.getTime() - from.getTime()) / 86400000);
    if (days <= 0) {
      throw new BadRequestException('`to` must be after `from`.');
    }
    if (days > 90) {
      throw new BadRequestException(
        'Calendar window is capped at 90 days. Request a smaller range.',
      );
    }

    const [rooms, bookings] = await Promise.all([
      this.prisma.room.findMany({
        where: { propertyId },
        select: {
          id: true,
          number: true,
          floor: true,
          status: true,
          roomType: { select: { id: true, name: true } },
        },
        orderBy: [{ floor: 'asc' }, { number: 'asc' }],
      }),
      this.prisma.booking.findMany({
        where: {
          propertyId,
          status: { notIn: [BookingStatus.CANCELLED, BookingStatus.NO_SHOW] },
          AND: [{ checkIn: { lt: to } }, { checkOut: { gt: from } }],
        },
        select: {
          id: true,
          reference: true,
          status: true,
          checkIn: true,
          checkOut: true,
          roomId: true,
          roomTypeId: true,
          guestFirstName: true,
          guestLastName: true,
          adults: true,
          children: true,
          totalAmount: true,
          source: true,
        },
        orderBy: { checkIn: 'asc' },
      }),
    ]);

    return {
      rooms,
      bookings: bookings.filter((b) => b.roomId !== null),
      unassigned: bookings.filter((b) => b.roomId === null),
    };
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private async sendConfirmationEmail(
    booking: {
      reference: string;
      guestEmail: string | null;
      guestFirstName: string | null;
      checkIn: Date;
      checkOut: Date;
      nights: number;
      totalAmount: Prisma.Decimal | number;
      currency: string;
    },
    propertyName: string,
  ) {
    if (!booking.guestEmail) return;
    const total = Number(booking.totalAmount).toFixed(2);
    const subject = `Your booking ${booking.reference} is confirmed`;
    const html = `
      <div style="font-family: Inter, Arial, sans-serif; color: #222; max-width: 560px;">
        <h1 style="font-size: 22px; margin: 0 0 8px;">Booking confirmed</h1>
        <p style="margin: 0 0 16px;">Hi ${escapeHtml(booking.guestFirstName ?? 'there')},</p>
        <p style="margin: 0 0 16px;">Your stay at <strong>${escapeHtml(propertyName)}</strong> is locked in.</p>
        <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
          <tr><td style="padding: 6px 0; color: #6b7280;">Reference</td><td style="padding: 6px 0;"><strong>${escapeHtml(booking.reference)}</strong></td></tr>
          <tr><td style="padding: 6px 0; color: #6b7280;">Check-in</td><td style="padding: 6px 0;">${booking.checkIn.toISOString().slice(0, 10)}</td></tr>
          <tr><td style="padding: 6px 0; color: #6b7280;">Check-out</td><td style="padding: 6px 0;">${booking.checkOut.toISOString().slice(0, 10)}</td></tr>
          <tr><td style="padding: 6px 0; color: #6b7280;">Nights</td><td style="padding: 6px 0;">${booking.nights}</td></tr>
          <tr><td style="padding: 6px 0; color: #6b7280;">Total</td><td style="padding: 6px 0;"><strong>${escapeHtml(booking.currency)} ${total}</strong></td></tr>
        </table>
        <p style="margin: 16px 0 0; color: #6b7280; font-size: 13px;">
          Quote your reference if you contact the property. We'll see you soon.
        </p>
      </div>
    `;
    await this.email.send(booking.guestEmail, subject, html);
  }
}

// ── Local helpers ────────────────────────────────────────────────────────

function generateReference(): string {
  const yr = new Date().getFullYear();
  return `MSK-${yr}-${nanoid(6).toUpperCase()}`;
}

function utcMidnight(d: Date | string): Date {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return new Date(
    Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()),
  );
}

function enumerateDays(from: Date, to: Date): Date[] {
  const days: Date[] = [];
  const start = utcMidnight(from).getTime();
  const end = utcMidnight(to).getTime();
  for (let t = start; t < end; t += 86400000) {
    days.push(new Date(t));
  }
  return days;
}

function sameDay(a: Date, b: Date): boolean {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
