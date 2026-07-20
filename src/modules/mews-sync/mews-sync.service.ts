import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { BookingSource, BookingStatus, Prisma } from "@prisma/client";

import { PrismaService } from "../../common/prisma/prisma.service";
import {
  mewsConfigured,
  reservationsGetAll,
  reservationStart,
} from "./mews-connector";

function mapState(state: string | undefined): BookingStatus {
  switch (state) {
    case "Started":
      return BookingStatus.CHECKED_IN;
    case "Processed":
      return BookingStatus.CHECKED_OUT;
    case "Canceled":
    case "Cancelled":
      return BookingStatus.CANCELLED;
    case "Confirmed":
    case "Requested":
      return BookingStatus.CONFIRMED;
    default:
      return BookingStatus.PENDING;
  }
}

function utcMidnight(iso: string): Date {
  const d = new Date(iso);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

@Injectable()
export class MewsSyncService {
  private readonly logger = new Logger(MewsSyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Periodic mirror. Quietly does nothing until Mews is configured (env +
   * at least one Mews-backed property), so it is safe to ship dark.
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async scheduledSync() {
    if (!mewsConfigured()) return;
    try {
      await this.syncAll();
    } catch (e) {
      this.logger.warn(
        `Scheduled Mews sync failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  private mewsBackedWhere(): Prisma.PropertyWhereInput {
    return {
      OR: [
        { NOT: { mewsEnterpriseId: null } },
        { NOT: { mewsAccessToken: null } },
      ],
    };
  }

  async syncAll() {
    const properties = await this.prisma.property.findMany({
      where: this.mewsBackedWhere(),
      select: { id: true },
    });
    const results = [];
    for (const p of properties) {
      try {
        results.push(await this.syncProperty(p.id));
      } catch (e) {
        this.logger.warn(
          `Mews sync failed for property ${p.id}: ${e instanceof Error ? e.message : String(e)}`,
        );
        results.push({ propertyId: p.id, error: String(e) });
      }
    }
    return { properties: properties.length, results };
  }

  async syncProperty(propertyId: string) {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
    });
    if (!property) throw new NotFoundException("Property not found");

    const accessToken =
      property.mewsAccessToken || process.env.MEWS_ACCESS_TOKEN || "";
    if (!accessToken) {
      throw new BadRequestException("No Mews access token for this property");
    }

    const now = Date.now();
    const startUtc = new Date(now - 7 * 86400000).toISOString();
    const endUtc = new Date(now + 60 * 86400000).toISOString();

    const { Reservations, Customers } = await reservationsGetAll(accessToken, {
      enterpriseId: property.mewsEnterpriseId ?? undefined,
      startUtc,
      endUtc,
    });

    const custById = new Map(Customers.map((c) => [c.Id, c]));
    let upserted = 0;

    for (const r of Reservations) {
      const ref = (r.Number || r.Id || "").trim();
      const start = r.StartUtc || r.ScheduledStartUtc;
      const end = r.EndUtc || r.ScheduledEndUtc;
      if (!ref || !start || !end) continue;

      const cust = r.CustomerId ? custById.get(r.CustomerId) : undefined;
      const checkIn = utcMidnight(start);
      const checkOut = utcMidnight(end);
      const nights = Math.max(
        1,
        Math.round((checkOut.getTime() - checkIn.getTime()) / 86400000),
      );
      const mewsStatus = mapState(r.State);

      // Guests present the Mews confirmation number at check-in, so the
      // booking reference must equal that number verbatim.
      const existing = await this.prisma.booking.findUnique({
        where: { reference: ref },
        select: { id: true, status: true },
      });

      // Never let a resync revert a check-in/out the app already recorded.
      const locallyAdvanced =
        existing &&
        (existing.status === BookingStatus.CHECKED_IN ||
          existing.status === BookingStatus.CHECKED_OUT);

      const common = {
        guestFirstName: cust?.FirstName ?? null,
        guestLastName: cust?.LastName ?? null,
        guestEmail: cust?.Email ?? null,
        guestPhone: cust?.Phone ?? null,
        adults: r.AdultCount ?? 1,
        children: r.ChildCount ?? 0,
        checkIn,
        checkOut,
        nights,
        externalId: r.Id,
      };

      if (existing) {
        await this.prisma.booking.update({
          where: { reference: ref },
          data: {
            ...common,
            ...(locallyAdvanced ? {} : { status: mewsStatus }),
          },
        });
      } else {
        await this.prisma.booking.create({
          data: {
            reference: ref,
            propertyId: property.id,
            source: BookingSource.OTHER,
            status: mewsStatus,
            totalAmount: 0,
            ...common,
          },
        });
      }
      upserted++;
    }

    return { propertyId, fetched: Reservations.length, upserted };
  }

  /**
   * Write a completed app check-in back to Mews so the client's PMS shows
   * the guest as arrived. Best-effort: never throws into the check-in flow.
   */
  async pushCheckIn(bookingId: string): Promise<void> {
    try {
      const booking = await this.prisma.booking.findUnique({
        where: { id: bookingId },
        select: { externalId: true, property: { select: { mewsEnterpriseId: true, mewsAccessToken: true } } },
      });
      const prop = booking?.property;
      if (!booking?.externalId || !prop) return;
      const isMews = !!(prop.mewsEnterpriseId || prop.mewsAccessToken);
      if (!isMews || !mewsConfigured()) return;
      const accessToken = prop.mewsAccessToken || process.env.MEWS_ACCESS_TOKEN || "";
      if (!accessToken) return;
      await reservationStart(accessToken, booking.externalId);
    } catch (e) {
      this.logger.warn(
        `Mews check-in write-back failed for booking ${bookingId}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }
}
