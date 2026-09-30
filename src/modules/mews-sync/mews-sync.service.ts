import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { BookingSource, BookingStatus } from "@prisma/client";

import { PrismaService } from "../../common/prisma/prisma.service";
import {
  mewsConfigured,
  reservationsGetAll,
  reservationStart,
  type MewsReservation,
  type MewsCustomer,
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

// Maps a property slug to the env-var suffix the website already uses for
// its Mews credentials (MEWS_TOKEN_<KEY> / MEWS_ENTERPRISE_<KEY>). Includes
// the backend's "the-residence" slug alongside the website's.
const SLUG_TO_ENV_KEY: Record<string, string> = {
  "msk-elite": "ELITE",
  "msk-premium": "PREMIUM",
  "msk-superior": "SUPERIOR",
  "msk-the-whiteley": "WHITELEY",
  "msk-hotel-82": "HOTEL82",
  "msk-the-residence": "RESIDENCE",
  "the-residence": "RESIDENCE",
};

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
    const t0 = Date.now();
    this.logger.log("Mews scheduled sync — starting");
    try {
      const result = await this.syncAll();
      this.logger.log(
        `Mews scheduled sync — done in ${Date.now() - t0}ms | properties=${result.properties} upserted=${result.totalUpserted} errors=${result.errors}`,
      );
    } catch (e) {
      this.logger.warn(
        `Mews scheduled sync — fatal error after ${Date.now() - t0}ms: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  /**
   * Resolve a property's Mews credentials. Prefers per-property values
   * stored on the record, then the env vars the website already uses
   * (keyed by slug, e.g. MEWS_TOKEN_ELITE / MEWS_ENTERPRISE_ELITE), then
   * the portfolio-wide MEWS_ACCESS_TOKEN. Returns null when nothing
   * resolves — that property simply isn't Mews-backed.
   */
  private resolveCreds(property: {
    slug: string;
    mewsAccessToken: string | null;
    mewsEnterpriseId: string | null;
  }): { accessToken: string; enterpriseId?: string } | null {
    const key = SLUG_TO_ENV_KEY[property.slug];
    const accessToken =
      property.mewsAccessToken ||
      (key ? process.env[`MEWS_TOKEN_${key}`] : undefined) ||
      process.env.MEWS_ACCESS_TOKEN ||
      "";
    if (!accessToken) return null;
    const enterpriseId =
      property.mewsEnterpriseId ||
      (key ? process.env[`MEWS_ENTERPRISE_${key}`] : undefined) ||
      undefined;
    return { accessToken, enterpriseId };
  }

  /**
   * Sync all Mews-backed properties in parallel (Promise.allSettled).
   * Each property is independent — a failure on one never blocks the others.
   */
  async syncAll() {
    const properties = await this.prisma.property.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        mewsAccessToken: true,
        mewsEnterpriseId: true,
      },
    });
    const targets = properties.filter((p) => this.resolveCreds(p) !== null);

    this.logger.log(`Mews syncAll — ${targets.length} propert${targets.length === 1 ? "y" : "ies"} to sync`);

    // Run all property syncs in parallel — failures are isolated
    const settled = await Promise.allSettled(
      targets.map((p) => this.syncProperty(p.id).then((r) => ({ ...r, propertyName: p.name }))),
    );

    let totalUpserted = 0;
    let errors = 0;
    const results = settled.map((s, i) => {
      if (s.status === "fulfilled") {
        totalUpserted += s.value.upserted;
        this.logger.log(
          `  ✓ ${targets[i].name} — fetched=${s.value.fetched} upserted=${s.value.upserted} elapsedMs=${s.value.elapsedMs}`,
        );
        return s.value;
      } else {
        errors++;
        this.logger.warn(
          `  ✗ ${targets[i].name} — ${s.reason instanceof Error ? s.reason.message : String(s.reason)}`,
        );
        return { propertyId: targets[i].id, propertyName: targets[i].name, error: String(s.reason) };
      }
    });

    return { properties: targets.length, totalUpserted, errors, results };
  }

  async syncProperty(propertyId: string) {
    const t0 = Date.now();
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
    });
    if (!property) throw new NotFoundException("Property not found");

    const creds = this.resolveCreds(property);
    if (!creds) {
      throw new BadRequestException("No Mews credentials for this property");
    }
    const { accessToken, enterpriseId } = creds;

    // Mews caps how wide a single reservations/getAll window can be, and the
    // cap varies per enterprise (some allow months, some ~100 hours). Try the
    // whole window once (fast for lenient enterprises); if it rejects the
    // interval, fall back to sub-4-day chunks. Merge, deduping by id.
    const now = Date.now();
    const rangeStart = now - 7 * 86400000;
    const rangeEnd = now + 30 * 86400000;
    const SAFE_CHUNK_MS = 4 * 86400000; // under the ~100-hour per-call limit

    const resById = new Map<string, MewsReservation>();
    const custById = new Map<string, MewsCustomer>();
    let totalApiMs = 0;
    let apiCalls = 0;

    const merge = (rs: MewsReservation[], cs: MewsCustomer[], elapsed: number) => {
      for (const r of rs) resById.set(r.Id, r);
      for (const c of cs) custById.set(c.Id, c);
      totalApiMs += elapsed;
      apiCalls++;
    };

    try {
      const one = await reservationsGetAll(accessToken, {
        enterpriseId,
        startUtc: new Date(rangeStart).toISOString(),
        endUtc: new Date(rangeEnd).toISOString(),
      });
      merge(one.Reservations, one.Customers, one.elapsedMs);
    } catch (err) {
      if (!/interval must not exceed/i.test(String(err))) throw err;
      // Chunked fallback for enterprises with strict interval caps
      this.logger.debug(`${property.name}: interval cap hit — falling back to ${SAFE_CHUNK_MS / 3600000}h chunks`);
      for (let s = rangeStart; s < rangeEnd; s += SAFE_CHUNK_MS) {
        const e = Math.min(s + SAFE_CHUNK_MS, rangeEnd);
        const part = await reservationsGetAll(accessToken, {
          enterpriseId,
          startUtc: new Date(s).toISOString(),
          endUtc: new Date(e).toISOString(),
        });
        merge(part.Reservations, part.Customers, part.elapsedMs);
      }
    }

    const Reservations = [...resById.values()];
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

    const elapsedMs = Date.now() - t0;
    this.logger.debug(
      `syncProperty ${property.name} — fetched=${Reservations.length} upserted=${upserted} apiCalls=${apiCalls} avgApiMs=${apiCalls ? Math.round(totalApiMs / apiCalls) : 0} totalMs=${elapsedMs}`,
    );

    return { propertyId, fetched: Reservations.length, upserted, elapsedMs, apiCalls, avgApiMs: apiCalls ? Math.round(totalApiMs / apiCalls) : 0 };
  }

  /** Return whether the global Mews CLIENT_TOKEN env is configured. */
  getConfig() {
    return {
      clientTokenConfigured: mewsConfigured(),
      baseUrl: process.env.MEWS_CONNECTOR_BASE_URL ?? "https://api.mews-demo.com/api/connector/v1",
      isDemo: !process.env.MEWS_CONNECTOR_BASE_URL,
      clientName: process.env.MEWS_CLIENT ?? process.env.MEWS_CLIENT_NAME ?? "MSK Guestbook",
    };
  }

  /** Return connection status for one or all Mews-backed properties. */
  async getStatus(propertyId?: string) {
    const where = propertyId ? { id: propertyId } : undefined;
    const properties = await this.prisma.property.findMany({
      where,
      select: {
        id: true,
        name: true,
        slug: true,
        mewsAccessToken: true,
        mewsEnterpriseId: true,
      },
    });
    return properties.map((p) => ({
      propertyId: p.id,
      propertyName: p.name,
      connected: !!(p.mewsAccessToken || this.resolveCreds(p) !== null),
      hasAccessToken: !!p.mewsAccessToken,
      hasEnterpriseId: !!p.mewsEnterpriseId,
      // Mask the token for security — only show last 6 chars
      maskedToken: p.mewsAccessToken
        ? "••••••••" + p.mewsAccessToken.slice(-6)
        : null,
    }));
  }

  /** Persist Mews credentials onto a property record. */
  async saveCredentials(
    propertyId: string,
    accessToken: string,
    enterpriseId?: string,
  ) {
    const updated = await this.prisma.property.update({
      where: { id: propertyId },
      data: {
        mewsAccessToken: accessToken || null,
        mewsEnterpriseId: enterpriseId || null,
      },
      select: { id: true, name: true, mewsEnterpriseId: true },
    });
    return {
      propertyId: updated.id,
      propertyName: updated.name,
      connected: !!accessToken,
    };
  }

  /**
   * Write a completed app check-in back to Mews so the client's PMS shows
   * the guest as arrived. Best-effort: never throws into the check-in flow.
   */
  async pushCheckIn(bookingId: string): Promise<void> {
    const t0 = Date.now();
    try {
      const booking = await this.prisma.booking.findUnique({
        where: { id: bookingId },
        select: { externalId: true, property: { select: { name: true, mewsEnterpriseId: true, mewsAccessToken: true } } },
      });
      const prop = booking?.property;
      if (!booking?.externalId || !prop) return;
      const isMews = !!(prop.mewsEnterpriseId || prop.mewsAccessToken);
      if (!isMews || !mewsConfigured()) return;
      const accessToken = prop.mewsAccessToken || process.env.MEWS_ACCESS_TOKEN || "";
      if (!accessToken) return;
      await reservationStart(accessToken, booking.externalId);
      this.logger.log(
        `Mews check-in write-back OK — booking=${bookingId} property=${prop.name} elapsedMs=${Date.now() - t0}`,
      );
    } catch (e) {
      this.logger.warn(
        `Mews check-in write-back failed — booking=${bookingId} elapsedMs=${Date.now() - t0} error=${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}
