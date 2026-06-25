import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AccountKind,
  AuthProvider,
  AvailabilityBlockReason,
  BookingSource,
  BookingStatus,
  OtpPurpose,
  Prisma,
  UserRole,
} from '@prisma/client';
import * as argon2 from 'argon2';
import { nanoid } from 'nanoid';

import { PrismaService } from '../../common/prisma/prisma.service';
import { AvailabilityService } from '../availability/availability.service';
import { OtpService } from '../auth/otp.service';
import { EmailService } from '../notifications/email.service';
import type { CheckInSubmitDto } from './check-in.dto';

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
    private readonly otp: OtpService,
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

  /**
   * Bookings belonging to the currently-authenticated guest. Matches on
   * BOTH guestUserId (the FK set when the user is logged in at booking
   * time) AND guestEmail (the email captured even when no account
   * exists yet) — so a guest who booked anonymously and later created
   * an account with the same email still sees their stays.
   *
   * Ordered by checkIn ASC so the profile page can pull "next stay"
   * trivially: the first item with checkIn >= today.
   */
  async mine(userId: string, email?: string | null) {
    const orClauses: Prisma.BookingWhereInput[] = [{ guestUserId: userId }];
    if (email) orClauses.push({ guestEmail: email });
    return this.prisma.booking.findMany({
      where: { OR: orClauses, status: { not: BookingStatus.CANCELLED } },
      orderBy: { checkIn: 'asc' },
      include: {
        property: { select: { id: true, name: true, slug: true } },
        room: { select: { id: true, number: true } },
      },
    });
  }

  /**
   * The "stay" the guest sees on Home / Profile / Handbook headers /
   * Profile Dashboard. Picks the user's current most-relevant booking:
   *
   *   - If they have a CHECKED_IN booking → that one
   *   - Else the nearest upcoming CONFIRMED/PENDING booking
   *   - Else the most recent CHECKED_OUT booking (so a guest who left
   *     yesterday can still pull invoices / write a review)
   *   - Returns `null` if the user has no bookings at all
   *
   * Match by guestUserId first, then fall back to guestEmail so bookings
   * created before the guest signed up still get attached to their
   * account once they create one with the same email.
   */
  async currentStay(userId: string, email?: string | null) {
    const orClauses: Prisma.BookingWhereInput[] = [{ guestUserId: userId }];
    if (email) orClauses.push({ guestEmail: email });
    const where: Prisma.BookingWhereInput = {
      OR: orClauses,
      status: { notIn: [BookingStatus.CANCELLED, BookingStatus.NO_SHOW] },
    };
    const include = {
      property: { select: { id: true, name: true, slug: true } },
      roomType: { select: { id: true, name: true } },
      room: { select: { id: true, number: true, floor: true } },
    } as const;

    const checkedIn = await this.prisma.booking.findFirst({
      where: { ...where, status: BookingStatus.CHECKED_IN },
      include,
      orderBy: { checkedInAt: 'desc' },
    });
    if (checkedIn) return this.toCurrentStaySummary(checkedIn);

    const upcoming = await this.prisma.booking.findFirst({
      where: {
        ...where,
        status: { in: [BookingStatus.CONFIRMED, BookingStatus.PENDING] },
      },
      include,
      orderBy: { checkIn: 'asc' },
    });
    if (upcoming) return this.toCurrentStaySummary(upcoming);

    const past = await this.prisma.booking.findFirst({
      where: { ...where, status: BookingStatus.CHECKED_OUT },
      include,
      orderBy: { checkedOutAt: 'desc' },
    });
    if (past) return this.toCurrentStaySummary(past);

    return null;
  }

  /**
   * Additional guests attached to the user's current stay. Returns
   * the `BookingGuest[]` rows of the booking surfaced by `currentStay`
   * so the Additional Guests profile screen renders the same set the
   * guest entered during the check-in wizard.
   */
  async currentStayGuests(userId: string, email?: string | null) {
    const stay = await this.currentStay(userId, email);
    if (!stay) return [];
    return this.prisma.bookingGuest.findMany({
      where: { bookingId: stay.id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        isPrimary: true,
        hasKids: true,
        kidsCount: true,
      },
    });
  }

  private toCurrentStaySummary(b: {
    id: string;
    reference: string;
    status: BookingStatus;
    checkIn: Date;
    checkOut: Date;
    checkedInAt: Date | null;
    checkedOutAt: Date | null;
    checkInCode: string | null;
    adults: number;
    children: number;
    totalAmount: Prisma.Decimal;
    paidAmount: Prisma.Decimal;
    currency: string;
    property: { id: string; name: string; slug: string | null };
    roomType: { id: string; name: string } | null;
    room: { id: string; number: string; floor: string | null } | null;
  }) {
    return {
      id: b.id,
      reference: b.reference,
      status: b.status,
      checkIn: b.checkIn,
      checkOut: b.checkOut,
      checkedInAt: b.checkedInAt,
      checkedOutAt: b.checkedOutAt,
      checkInCode: b.checkInCode,
      adults: b.adults,
      children: b.children,
      totalAmount: Number(b.totalAmount),
      paidAmount: Number(b.paidAmount),
      outstandingAmount: Math.max(0, Number(b.totalAmount) - Number(b.paidAmount)),
      currency: b.currency,
      property: b.property,
      roomType: b.roomType,
      room: b.room,
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
  /**
   * Lookup the wizard-friendly booking summary by reservation reference,
   * with no OTP required. Used by the mobile guest-wizard to pre-fill
   * Page 1's Property + Room Type fields as soon as the guest finishes
   * typing the reservation number, before the OTP step.
   *
   * Returns the same shape as the `booking` field of the /verify
   * response so the mobile side can use a single `CheckInBookingSummary`
   * type. No token is issued — the existing OTP flow still gates every
   * authenticated step (signature upload, submit).
   */
  async checkInLookup(reference: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { reference: reference.trim() },
      include: {
        property: {
          select: {
            id: true,
            name: true,
            roomTypes: {
              select: {
                id: true,
                name: true,
                basePrice: true,
                currency: true,
                description: true,
                bedConfig: true,
                maxOccupancy: true,
                ordering: true,
              },
              orderBy: { ordering: 'asc' },
            },
          },
        },
        roomType: { select: { id: true, name: true } },
        // Most recent payment attempt — its `method` drives the
        // "preferred payment method" line on Page 1. We don't pull all
        // payments, just the latest, since the wizard only displays one.
        payments: {
          select: { method: true, status: true, paidAt: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!booking) throw new NotFoundException('Reservation not found');
    return this.toCheckInBookingSummary(booking);
  }

  /**
   * Map a fully-included Booking record to the wire shape used by both
   * /check-in/lookup (no OTP) and the booking field of /check-in/verify
   * (post-OTP). Keeping the projection in one place means the two
   * endpoints can never drift out of sync.
   */
  private toCheckInBookingSummary(booking: {
    id: string;
    reference: string;
    checkIn: Date;
    checkOut: Date;
    guestFirstName: string | null;
    guestLastName: string | null;
    guestEmail: string | null;
    adults: number;
    children: number;
    totalAmount: Prisma.Decimal;
    paidAmount: Prisma.Decimal;
    currency: string;
    property: {
      id: string;
      name: string;
      roomTypes: Array<{
        id: string;
        name: string;
        basePrice: Prisma.Decimal;
        currency: string;
        description: string | null;
        bedConfig: string | null;
        maxOccupancy: number;
      }>;
    };
    roomType: { id: string; name: string } | null;
    payments: Array<{ method: string }>;
  }) {
    const totalAmount = Number(booking.totalAmount);
    const paidAmount = Number(booking.paidAmount);
    return {
      id: booking.id,
      reference: booking.reference,
      propertyId: booking.property.id,
      propertyName: booking.property.name,
      roomType: booking.roomType
        ? { id: booking.roomType.id, name: booking.roomType.name }
        : null,
      availableRoomTypes: booking.property.roomTypes.map((rt) => ({
        id: rt.id,
        name: rt.name,
        basePrice: Number(rt.basePrice),
        currency: rt.currency,
        description: rt.description,
        bedConfig: rt.bedConfig,
        maxOccupancy: rt.maxOccupancy,
      })),
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      guestFirstName: booking.guestFirstName,
      guestLastName: booking.guestLastName,
      guestEmail: booking.guestEmail,
      adults: booking.adults,
      children: booking.children,
      // ── Payment summary, drives the orange Payment box on Page 1.
      totalAmount,
      paidAmount,
      outstandingAmount: Math.max(0, totalAmount - paidAmount),
      currency: booking.currency,
      preferredPaymentMethod: booking.payments[0]?.method ?? null,
    };
  }

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

  // ── Mobile guest-wizard check-in ───────────────────────────────────────

  /**
   * Resolve a booking by reference + last-name and send an OTP to the
   * contact on file. Used by the wizard's first screen. Errors are
   * intentionally generic so we don't leak which half (reference or
   * lastName) was wrong.
   */
  async checkInStart(reference: string, lastName: string) {
    // Trim before lookup — mobile keyboards auto-add a trailing space
    // and copy-paste from confirmation emails sometimes adds whitespace
    // either side. Without normalization, "TEST-2026-0001 " or
    // "Anderson " both fail with "Reservation not found" even though
    // the stored row is correct.
    const normalizedRef = reference.trim();
    const normalizedLast = lastName.trim().toLowerCase();
    const booking = await this.prisma.booking.findUnique({
      where: { reference: normalizedRef },
      include: { guestUser: true },
    });
    if (!booking) throw new NotFoundException('Reservation not found');

    const lastNameMatch =
      booking.guestLastName?.trim().toLowerCase() === normalizedLast ||
      booking.guestUser?.lastName?.trim().toLowerCase() === normalizedLast;
    if (!lastNameMatch) throw new NotFoundException('Reservation not found');

    // Fail fast on non-check-in-able states so the guest doesn't OTP-verify
    // and fill in the entire wizard only to be rejected at submit time.
    // Re-running the wizard against a CHECKED_IN or CHECKED_OUT booking
    // used to silently overwrite signature/timestamps; reject up front
    // with a state-aware message so the UI can route appropriately.
    assertCheckInAble(booking.status);

    const destination = booking.guestEmail ?? booking.guestPhone;
    if (!destination) {
      throw new BadRequestException('No contact on file for reservation');
    }

    await this.otp.send({
      destination,
      channel: booking.guestEmail ? 'email' : 'sms',
      purpose: OtpPurpose.RESERVATION_ENQUIRY,
      userId: booking.guestUserId ?? undefined,
    });

    return {
      otpSent: true,
      bookingId: booking.id,
      contactHint: maskContact(destination),
    };
  }

  /**
   * Consume the OTP from `checkInStart` and return a summary of the booking
   * plus a stable 6-digit `checkInCode` (generated on first verify, kept on
   * subsequent re-verifies). The controller wraps a JWT around the booking
   * id; this method only handles persistence + lookup.
   */
  async checkInVerify(reference: string, lastName: string, code: string) {
    const normalizedRef = reference.trim();
    const normalizedLast = lastName.trim().toLowerCase();
    const booking = await this.prisma.booking.findUnique({
      where: { reference: normalizedRef },
      include: {
        guestUser: true,
        property: {
          select: {
            id: true,
            name: true,
            // All published room types at the property, so the wizard
            // can render real options when the guest asks to switch
            // instead of falling back to a hard-coded mock list.
            roomTypes: {
              select: {
                id: true,
                name: true,
                basePrice: true,
                currency: true,
                description: true,
                bedConfig: true,
                maxOccupancy: true,
                ordering: true,
              },
              orderBy: { ordering: 'asc' },
            },
          },
        },
        // The room type already on the booking — used to render the
        // "fixed" read-only field when the guest answers No to the
        // change question.
        roomType: { select: { id: true, name: true } },
        payments: {
          select: { method: true, status: true, paidAt: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!booking) throw new NotFoundException('Reservation not found');

    const lastNameMatch =
      booking.guestLastName?.trim().toLowerCase() === normalizedLast ||
      booking.guestUser?.lastName?.trim().toLowerCase() === normalizedLast;
    if (!lastNameMatch) throw new NotFoundException('Reservation not found');

    const destination = booking.guestEmail ?? booking.guestPhone;
    if (!destination) {
      throw new BadRequestException('No contact on file for reservation');
    }

    await this.otp.consume({
      destination,
      code,
      purpose: OtpPurpose.RESERVATION_ENQUIRY,
    });

    // Generate the long-lived check-in code on first successful verify so
    // re-verifying (e.g. resumed wizard) yields the same digits — the
    // receptionist may have already noted the previous value.
    let checkInCode = booking.checkInCode;
    if (!checkInCode) {
      checkInCode = await this.allocateUniqueCheckInCode();
      await this.prisma.booking.update({
        where: { id: booking.id },
        data: { checkInCode },
      });
    }

    return {
      bookingId: booking.id,
      checkInCode,
      booking: this.toCheckInBookingSummary(booking),
    };
  }

  /**
   * Save a free-form note from the guest after submit. The Success page
   * lets them type additional context for reception ("we'll arrive late,
   * please leave the key with the doorman") and tap "Send to
   * accommodation"; this endpoint just patches the booking's
   * additionalInfoText so reception sees it in the PMS. No status flip,
   * no guest-row rewrite — it's a targeted update so re-tapping the
   * button is safe.
   */
  async checkInSetNote(bookingId: string, text: string) {
    const trimmed = text.trim().slice(0, 2000);
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, status: true },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.status === BookingStatus.CANCELLED || booking.status === BookingStatus.NO_SHOW) {
      throw new BadRequestException('Booking is not in a check-in-able state');
    }
    await this.prisma.booking.update({
      where: { id: bookingId },
      data: { additionalInfoText: trimmed },
    });
    return { saved: true };
  }

  /**
   * Email the booking's `checkInCode` to the guest. The "Email Code"
   * popup in the wizard's verification page calls this. Falls back to the
   * booking's stored guestEmail when the caller doesn't supply one.
   */
  async checkInEmailCode(bookingId: string, overrideEmail?: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (!booking.checkInCode) {
      throw new BadRequestException('Check-in code has not been issued yet');
    }
    const to = overrideEmail ?? booking.guestEmail;
    if (!to) throw new BadRequestException('No email on file for this booking');

    const subject = `Your MSK check-in code: ${booking.checkInCode}`;
    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px">
        <h2 style="margin:0 0 12px">Your check-in code</h2>
        <p style="color:#555;line-height:1.5">
          Show this code at reception to be greeted faster.
        </p>
        <div style="font-size:28px;letter-spacing:6px;font-weight:700;
                    background:#FFD8B5;border-radius:12px;padding:18px 24px;
                    text-align:center;margin:18px 0;color:#222">
          ${booking.checkInCode}
        </div>
        <p style="color:#888;font-size:13px">
          Reservation ${booking.reference}
        </p>
      </div>
    `;
    // Translate SMTP-level failures into a clear 4xx the mobile modal
    // can render verbatim. We don't want the previous silent-success
    // bug back (where the wizard claimed it sent even though SMTP
    // rejected), and we also don't want a raw 500 / stack trace
    // bubbling up to a guest who typed an unverified email address.
    try {
      await this.email.send(to, subject, html);
    } catch (err) {
      this.logger.warn(
        `Check-in code email send failed for ${to}: ${err instanceof Error ? err.message : err}`,
      );
      throw new BadRequestException(
        `Could not send the code to ${maskContact(to)}. ` +
          `If this is a different address from the one on the booking, ` +
          `the email provider may not allow sending to it yet — try the original booking email.`,
      );
    }
    return { sent: true, contactHint: maskContact(to) };
  }

  /**
   * Persist the wizard's full submission. Single atomic transaction:
   * Booking fields + the (replace-all) BookingGuest rows. Sets status to
   * CHECKED_IN when the guest opts to verify at reception NOW; verify-later
   * keeps the booking CONFIRMED for the receptionist to flip on arrival.
   */
  async checkInSubmit(bookingId: string, dto: CheckInSubmitDto) {
    if (!dto.acceptedTerms) {
      throw new BadRequestException('Terms must be accepted');
    }
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    // Defense-in-depth: even if a stale check-in token was reused, never
    // let the submit overwrite a CHECKED_IN or CHECKED_OUT booking's
    // signature / checkedInAt / additional-guest rows.
    assertCheckInAble(booking.status);

    const now = new Date();
    // Completing the wizard IS the check-in — regardless of whether the
    // guest opted to verify their ID at reception NOW or LATER. The
    // physicalVerifyChoice flag is still persisted so reception knows
    // whether they still need to ID-check the guest, but it must not
    // gate the status flip (the previous behaviour left the booking as
    // CONFIRMED after a fully-completed wizard, which then broke
    // sign-in-by-code because /auth/login/code requires CHECKED_IN).
    const shouldFlipCheckedIn = booking.status !== BookingStatus.CHECKED_IN;

    // Auto-link the booking to a User account. If a User with the
    // guest's email already exists, link to it. Otherwise create a
    // lightweight WEB_GUEST account from the wizard's contact fields so
    // the guest can immediately sign in via /auth/login/code from the
    // success screen — without this, a booking with an unregistered
    // guest email stays orphaned forever and "Sign In with check-in
    // code" dead-ends with "not linked to an account yet".
    const guestEmail = dto.email ?? booking.guestEmail;
    const guestFirstName = dto.firstName ?? booking.guestFirstName ?? undefined;
    const guestLastName = dto.lastName ?? booking.guestLastName ?? undefined;
    const guestPhone = dto.phone ?? booking.guestPhone ?? undefined;
    let guestUserIdToSet: string | null = booking.guestUserId;
    if (!guestUserIdToSet && guestEmail) {
      const guestUser = await this.prisma.user.findFirst({
        where: { email: guestEmail },
        select: { id: true },
      });
      if (guestUser) {
        guestUserIdToSet = guestUser.id;
      } else {
        // Create a minimal guest account. authProvider=OTP because the
        // canonical way back in is the emailed login OTP or the check-in
        // code itself; no password is set. emailVerified=true because
        // the OTP-verified check-in already proved the guest controls
        // this address. A GuestProfile row is created alongside so any
        // future "view my stays" endpoint has somewhere to hang.
        const fullName =
          [guestFirstName ?? '', guestLastName ?? ''].filter(Boolean).join(' ').trim() ||
          null;
        const created = await this.prisma.user.create({
          data: {
            email: guestEmail,
            phone: guestPhone,
            firstName: guestFirstName,
            lastName: guestLastName,
            fullName,
            role: UserRole.WEB_GUEST,
            primaryRole: UserRole.WEB_GUEST,
            // Auto-created from the mobile check-in flow → APP lane.
            accountKind: AccountKind.APP,
            authProvider: AuthProvider.OTP_ONLY,
            emailVerified: true,
            guestProfile: { create: {} },
          },
          select: { id: true },
        });
        guestUserIdToSet = created.id;
      }
    }

    // If this is a behalf-booking and the booker is a real signed-up
    // user, capture their User id separately (kept distinct from
    // guestUserId so the booker doesn't accidentally claim someone
    // else's stay in their own /me/current-stay view).
    let bookedByUserId: string | null = null;
    if (dto.isBehalfBooking && dto.bookerEmail && dto.bookerEmail !== dto.email) {
      const bookerUser = await this.prisma.user.findFirst({
        where: { email: dto.bookerEmail },
        select: { id: true },
      });
      bookedByUserId = bookerUser?.id ?? null;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: bookingId },
        data: {
          // Optional booker-correction fields
          guestFirstName: dto.firstName ?? booking.guestFirstName,
          guestLastName: dto.lastName ?? booking.guestLastName,
          guestEmail: dto.email ?? booking.guestEmail,
          guestPhone: dto.phone ?? booking.guestPhone,

          // Behalf-booking fields. Persist whatever the wizard provided —
          // the booker is a separate identity from the guest above.
          isBehalfBooking: dto.isBehalfBooking ?? booking.isBehalfBooking,
          bookerFirstName: dto.bookerFirstName ?? booking.bookerFirstName,
          bookerLastName: dto.bookerLastName ?? booking.bookerLastName,
          bookerEmail: dto.bookerEmail ?? booking.bookerEmail,
          bookerPhone: dto.bookerPhone ?? booking.bookerPhone,
          ...(guestUserIdToSet && guestUserIdToSet !== booking.guestUserId && {
            guestUserId: guestUserIdToSet,
          }),
          ...(bookedByUserId && { bookedByUserId }),

          arrivalTime: dto.arrivalTime ?? booking.arrivalTime,
          wantsRoomTypeChange: dto.wantsRoomTypeChange ?? booking.wantsRoomTypeChange,
          requestedRoomType: dto.requestedRoomType ?? booking.requestedRoomType,
          physicalVerifyChoice: dto.physicalVerifyChoice,
          addressByCode: dto.addressByCode,
          signatureUrl: dto.signatureUrl ?? booking.signatureUrl,
          additionalInfoText: dto.additionalInfoText ?? booking.additionalInfoText,
          acceptedTermsAt: now,
          ...(shouldFlipCheckedIn && {
            status: BookingStatus.CHECKED_IN,
            checkedInAt: now,
          }),
        },
      });

      if (dto.guests && dto.guests.length > 0) {
        // Replace existing additional-guest rows so re-submitting a wizard
        // doesn't leave stale guests around. The primary booker is stored
        // on Booking itself, so we only persist the *additional* people.
        await tx.bookingGuest.deleteMany({ where: { bookingId } });
        await tx.bookingGuest.createMany({
          data: dto.guests.map((g) => ({
            bookingId,
            fullName: `${g.firstName} ${g.lastName}`.trim(),
            email: g.email,
            phone: g.phone,
            hasKids: g.hasKids ?? null,
            kidsCount: g.kidsCount ?? null,
          })),
        });
      }
    });

    // Send the check-in code to whoever needs it. For a self-checkin
    // that's just the guest; for a behalf-booking it's both the guest
    // (so the actual occupant can present it at reception) and the
    // booker (so the operator has it too). Fire-and-forget — a slow or
    // misconfigured mailer mustn't block the wizard's submit response.
    void this.sendCheckInCodeEmails(bookingId, !!dto.isBehalfBooking).catch((err) => {
      this.logger.warn(
        `Post-submit check-in code email failed for booking ${bookingId}: ${err instanceof Error ? err.message : err}`,
      );
    });

    return this.detail(bookingId);
  }

  /**
   * Send the booking's `checkInCode` to one or both addresses depending
   * on whether it's a behalf-booking. Quietly does nothing if the code
   * isn't issued yet (shouldn't happen at submit time, but defensive).
   */
  private async sendCheckInCodeEmails(bookingId: string, isBehalf: boolean): Promise<void> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        reference: true,
        checkInCode: true,
        guestEmail: true,
        guestFirstName: true,
        bookerEmail: true,
        bookerFirstName: true,
      },
    });
    if (!booking?.checkInCode) return;
    const subject = `Your MSK check-in code: ${booking.checkInCode}`;
    const buildHtml = (recipientFirstName: string | null, isForBooker: boolean) => `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px">
        <h2 style="margin:0 0 12px">Hi ${escapeHtml(recipientFirstName ?? 'there')},</h2>
        <p style="color:#555;line-height:1.5">
          ${isForBooker
            ? 'Here is the check-in code for the reservation you booked on someone\'s behalf. Please forward it to the guest if helpful.'
            : 'Your check-in code is below. Show it at reception to be greeted faster.'}
        </p>
        <div style="font-size:28px;letter-spacing:6px;font-weight:700;
                    background:#FFD8B5;border-radius:12px;padding:18px 24px;
                    text-align:center;margin:18px 0;color:#222">
          ${booking.checkInCode}
        </div>
        <p style="color:#888;font-size:13px">Reservation ${booking.reference}</p>
      </div>`;
    const sends: Array<Promise<void>> = [];
    if (booking.guestEmail) {
      sends.push(this.email.send(booking.guestEmail, subject, buildHtml(booking.guestFirstName, false)));
    }
    if (isBehalf && booking.bookerEmail && booking.bookerEmail !== booking.guestEmail) {
      sends.push(this.email.send(booking.bookerEmail, subject, buildHtml(booking.bookerFirstName, true)));
    }
    await Promise.all(sends);
  }

  /**
   * Generate a 6-digit code that isn't already used by another booking.
   * Retries on the rare collision; gives up after a small handful of
   * attempts to avoid hanging if every code is somehow taken (it won't be).
   */
  private async allocateUniqueCheckInCode(): Promise<string> {
    for (let i = 0; i < 6; i++) {
      const candidate = Math.floor(100_000 + Math.random() * 900_000).toString();
      const clash = await this.prisma.booking.findUnique({
        where: { checkInCode: candidate },
        select: { id: true },
      });
      if (!clash) return candidate;
    }
    throw new Error('Could not allocate a unique check-in code');
  }

  // ── Mobile guest-wizard checkout ────────────────────────────────────

  /**
   * Sign in to the checkout flow with email + password. Defers to the
   * existing auth service for the actual credential check so we don't
   * duplicate password handling, then returns just the userId — the
   * controller wraps it in a check-out scoped JWT (`mode: 'user'`).
   */
  async checkOutSignInWithCredentials(email: string, password: string) {
    const user = await this.prisma.user.findFirst({
      where: { email },
      include: { credentials: true },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const credential = user.credentials.find(
      (c) => c.provider === AuthProvider.PASSWORD,
    );
    if (!credential) throw new UnauthorizedException('Invalid credentials');
    const valid = await argon2.verify(credential.secretHash, password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');
    return { userId: user.id };
  }

  /**
   * Sign in to the checkout flow using the 6-digit check-in code the
   * guest received during their check-in wizard. The code identifies
   * exactly one booking; controller issues a check-out token with
   * `mode: 'booking'` so the token holder can only act on that one.
   * Only bookings currently in CHECKED_IN status are eligible.
   */
  async checkOutSignInWithCode(code: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { checkInCode: code },
      select: { id: true, status: true, guestUserId: true },
    });
    if (!booking) throw new UnauthorizedException('Invalid code');
    if (booking.status !== BookingStatus.CHECKED_IN) {
      throw new BadRequestException(
        'This reservation is not currently checked in',
      );
    }
    // If the booking is linked to a real user, prefer the wider
    // "user" mode so they can see all their active stays in one
    // session. Otherwise fall back to a booking-scoped token.
    return booking.guestUserId
      ? { sub: booking.guestUserId, mode: 'user' as const }
      : { sub: booking.id, mode: 'booking' as const };
  }

  /**
   * Send a one-time code to a guest's email for checkout sign-in.
   * Mirrors the existing password-reset OTP delivery — uses the
   * shared OtpService so dev environments can read the code from the
   * server logs even before SMTP is wired.
   */
  async checkOutRequestOtp(email: string) {
    const user = await this.prisma.user.findFirst({
      where: { email },
      select: { id: true, isActive: true, email: true },
    });
    // Don't leak whether the address exists — always claim success.
    if (!user || !user.isActive || !user.email) {
      return { sent: true };
    }
    await this.otp.send({
      destination: user.email,
      channel: 'email',
      purpose: OtpPurpose.CHECKOUT_SIGN_IN,
      userId: user.id,
    });
    return { sent: true };
  }

  /**
   * Verify a checkout OTP and return the userId. Controller wraps the
   * id in a check-out token (`mode: 'user'`).
   */
  async checkOutVerifyOtp(email: string, code: string) {
    const user = await this.prisma.user.findFirst({
      where: { email },
      select: { id: true, isActive: true, email: true },
    });
    if (!user || !user.isActive || !user.email) {
      throw new UnauthorizedException('Invalid or expired code');
    }
    await this.otp.consume({
      destination: user.email,
      code,
      purpose: OtpPurpose.CHECKOUT_SIGN_IN,
    });
    return { userId: user.id };
  }

  /**
   * List the active (CHECKED_IN) bookings the holder of a check-out
   * token can act on. In `user` mode that's every CHECKED_IN booking
   * belonging to that user; in `booking` mode it's exactly one
   * row — the booking the code authenticated to.
   */
  async checkOutListActive(sub: string, mode: 'user' | 'booking') {
    const bookings = await this.prisma.booking.findMany({
      where:
        mode === 'user'
          ? { guestUserId: sub, status: BookingStatus.CHECKED_IN }
          : { id: sub, status: BookingStatus.CHECKED_IN },
      include: {
        property: { select: { id: true, name: true } },
        roomType: { select: { id: true, name: true } },
      },
      orderBy: { checkIn: 'asc' },
    });
    return bookings.map((b) => {
      const totalAmount = Number(b.totalAmount);
      const paidAmount = Number(b.paidAmount);
      return {
        id: b.id,
        reference: b.reference,
        propertyName: b.property.name,
        roomTypeName: b.roomType?.name ?? null,
        checkIn: b.checkIn,
        checkOut: b.checkOut,
        outstandingAmount: Math.max(0, totalAmount - paidAmount),
        currency: b.currency,
      };
    });
  }

  /**
   * Final checkout submit. Saves the photo URLs, key-handover details,
   * feedback note, and flips the booking to CHECKED_OUT. Refuses to
   * touch a booking that's already CHECKED_OUT, CANCELLED, or NO_SHOW;
   * the guest needs CHECKED_IN status to check out. Enforces token-mode
   * ↔ booking ownership: a `user`-mode token can only check out one of
   * its own bookings; a `booking`-mode token can only check out the
   * exact booking the code authenticated to.
   */
  async checkOutSubmit(
    sub: string,
    mode: 'user' | 'booking',
    dto: import('./check-out.dto').CheckOutSubmitDto,
  ) {
    if (!dto.confirmed) {
      throw new BadRequestException(
        'Checkout confirmation checkbox must be ticked',
      );
    }
    if (dto.keyLocation === 'ROOM' && !dto.keyLocationPhotoUrl) {
      throw new BadRequestException(
        'A photo of the key location is required when leaving the key in the room',
      );
    }

    const booking = await this.prisma.booking.findUnique({
      where: { id: dto.bookingId },
      select: { id: true, status: true, guestUserId: true },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.status !== BookingStatus.CHECKED_IN) {
      throw new BadRequestException(
        'This booking is not currently checked in',
      );
    }
    if (mode === 'booking' && booking.id !== sub) {
      throw new UnauthorizedException('Token cannot act on this booking');
    }
    if (mode === 'user' && booking.guestUserId !== sub) {
      throw new UnauthorizedException('Token cannot act on this booking');
    }

    const now = new Date();
    await this.prisma.booking.update({
      where: { id: dto.bookingId },
      data: {
        status: BookingStatus.CHECKED_OUT,
        checkedOutAt: now,
        checkoutRoomPhotoUrls: dto.roomPhotoUrls,
        checkoutBathroomPhotoUrls: dto.bathroomPhotoUrls,
        checkoutKeyLocation: dto.keyLocation,
        checkoutStaffName: dto.keyLocation === 'STAFF' ? dto.staffName ?? null : null,
        checkoutKeyLocationPhotoUrl:
          dto.keyLocation === 'ROOM' ? dto.keyLocationPhotoUrl ?? null : null,
        checkoutFeedback: dto.feedback ?? null,
        checkoutConfirmedAt: now,
      },
    });
    return { checkedOut: true };
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

    await this.prisma.booking.update({
      where: { id: bookingId },
      data: { roomId: roomId ?? null },
      select: { id: true },
    });

    // Return the same shape `detail()` returns so the admin UI can replace
    // its booking state in-place without losing property/payments/invoices.
    return this.detail(bookingId);
  }

  /**
   * Move a booking's check-in/out window. Used by the reservations
   * calendar's horizontal drag. Reuses the same overlap-check as
   * assignRoom: if the booking has a pinned room, a date shift must not
   * collide with another active booking on that room.
   *
   * `nights` is recomputed but `totalAmount` is intentionally LEFT AS-IS —
   * dragging a booking shouldn't silently re-price; the operator should
   * confirm the new total in the booking editor before billing.
   */
  async moveDates(
    bookingId: string,
    checkInRaw: string,
    checkOutRaw: string,
  ) {
    const checkIn = new Date(checkInRaw);
    const checkOut = new Date(checkOutRaw);
    if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime())) {
      throw new BadRequestException('checkIn and checkOut must be valid dates.');
    }
    if (checkOut <= checkIn) {
      throw new BadRequestException('checkOut must be after checkIn.');
    }

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        status: true,
        roomId: true,
        propertyId: true,
        roomTypeId: true,
      },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (
      booking.status === BookingStatus.CANCELLED ||
      booking.status === BookingStatus.CHECKED_OUT
    ) {
      throw new BadRequestException(
        `Cannot move a ${booking.status.toLowerCase().replace('_', ' ')} booking.`,
      );
    }

    if (booking.roomId) {
      const conflict = await this.prisma.booking.findFirst({
        where: {
          id: { not: bookingId },
          roomId: booking.roomId,
          status: { notIn: [BookingStatus.CANCELLED, BookingStatus.NO_SHOW] },
          AND: [
            { checkIn: { lt: checkOut } },
            { checkOut: { gt: checkIn } },
          ],
        },
        select: { reference: true },
      });
      if (conflict) {
        throw new ConflictException(
          `Those dates overlap booking ${conflict.reference} on the same room.`,
        );
      }
    }

    const nights = Math.max(
      1,
      Math.round((checkOut.getTime() - checkIn.getTime()) / 86_400_000),
    );

    await this.prisma.booking.update({
      where: { id: bookingId },
      data: { checkIn, checkOut, nights },
      select: { id: true },
    });

    return this.detail(bookingId);
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
    // Booking confirmations are sent from a dedicated reservations
    // mailbox so guests' replies route to the right team.
    // BOOKING_EMAIL_FROM overrides if set; otherwise the documented
    // default is used. The address has to be one the SMTP credentials
    // are allowed to send as — set it on the SMTP provider too.
    const from =
      process.env.BOOKING_EMAIL_FROM ?? 'MSK Reservations <reservation@mskresidence.com>';
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
    await this.email.send(booking.guestEmail, subject, html, from);
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

/** Mask an email or phone for display in API responses. */
function maskContact(value: string): string {
  if (value.includes('@')) {
    const [local, domain] = value.split('@');
    return `${local.slice(0, 2)}***@${domain}`;
  }
  return `${'*'.repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Reject the wizard for any booking whose state isn't open to check-in.
 * Throws a BadRequestException with a status-specific message so the
 * mobile wizard can render the right copy (and route the guest to home
 * or sign-in) instead of dead-ending in a generic alert.
 *
 * The thrown exception's body includes a machine-readable `reason` code
 * (`ALREADY_CHECKED_IN`, `ALREADY_CHECKED_OUT`, `CANCELLED`, `NO_SHOW`)
 * so the client can branch without parsing the human message.
 */
function assertCheckInAble(status: BookingStatus): void {
  if (status === BookingStatus.PENDING || status === BookingStatus.CONFIRMED) {
    return;
  }
  const map: Partial<Record<BookingStatus, { reason: string; message: string }>> = {
    [BookingStatus.CHECKED_IN]: {
      reason: 'ALREADY_CHECKED_IN',
      message: "You're already checked in for this reservation.",
    },
    [BookingStatus.CHECKED_OUT]: {
      reason: 'ALREADY_CHECKED_OUT',
      message: 'This stay has already ended.',
    },
    [BookingStatus.CANCELLED]: {
      reason: 'CANCELLED',
      message: 'This reservation was cancelled.',
    },
    [BookingStatus.NO_SHOW]: {
      reason: 'NO_SHOW',
      message: 'This reservation is closed.',
    },
  };
  const entry = map[status] ?? {
    reason: 'NOT_CHECK_IN_ABLE',
    message: 'This reservation is not currently open for check-in.',
  };
  throw new BadRequestException({
    statusCode: 400,
    message: entry.message,
    reason: entry.reason,
  });
}
