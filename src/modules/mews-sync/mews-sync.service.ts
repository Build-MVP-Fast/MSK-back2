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
  spacesGetAll,
  type MewsReservation,
  type MewsCustomer,
  type MewsSpace,
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
    try {
      await this.syncAll();
    } catch (e) {
      this.logger.warn(
        `Scheduled Mews sync failed: ${e instanceof Error ? e.message : String(e)}`,
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

  async syncAll() {
    const properties = await this.prisma.property.findMany({
      select: {
        id: true,
        slug: true,
        mewsAccessToken: true,
        mewsEnterpriseId: true,
      },
    });
    const targets = properties.filter((p) => this.resolveCreds(p) !== null);
    const results = [];
    for (const p of targets) {
      try {
        results.push(await this.syncProperty(p.id));
      } catch (e) {
        this.logger.warn(
          `Mews sync failed for property ${p.id}: ${e instanceof Error ? e.message : String(e)}`,
        );
        results.push({ propertyId: p.id, error: String(e) });
      }
    }
    return { properties: targets.length, results };
  }

  async syncProperty(propertyId: string) {
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
    const spaceById = new Map<string, MewsSpace>();
    const merge = (
      rs: MewsReservation[],
      cs: MewsCustomer[],
      ss: MewsSpace[],
    ) => {
      for (const r of rs) resById.set(r.Id, r);
      for (const c of cs) custById.set(c.Id, c);
      for (const s of ss) spaceById.set(s.Id, s);
    };

    try {
      const one = await reservationsGetAll(accessToken, {
        enterpriseId,
        startUtc: new Date(rangeStart).toISOString(),
        endUtc: new Date(rangeEnd).toISOString(),
      });
      merge(one.Reservations, one.Customers, one.Spaces);
    } catch (err) {
      if (!/interval must not exceed/i.test(String(err))) throw err;
      for (let s = rangeStart; s < rangeEnd; s += SAFE_CHUNK_MS) {
        const e = Math.min(s + SAFE_CHUNK_MS, rangeEnd);
        const part = await reservationsGetAll(accessToken, {
          enterpriseId,
          startUtc: new Date(s).toISOString(),
          endUtc: new Date(e).toISOString(),
        });
        merge(part.Reservations, part.Customers, part.Spaces);
      }
    }
    const Reservations = [...resById.values()];

    // Build a mewsSpaceId → local Room.id lookup so synced bookings land on
    // the correct calendar row. We match on room number (Space.Number ===
    // Room.number) — no schema migration needed.
    const localRooms = await this.prisma.room.findMany({
      where: { propertyId: property.id },
      select: { id: true, number: true },
    });
    const roomIdByNumber = new Map<string, string>();
    for (const room of localRooms) {
      roomIdByNumber.set(room.number.trim(), room.id);
    }

    // Diagnostic log — printed once per sync so we can verify the mapping.
    {
      const sampleReservations = [...resById.values()].slice(0, 3);
      this.logger.log(
        `[MewsSync] property=${propertyId} ` +
          `reservations=${resById.size} spaces=${spaceById.size} ` +
          `localRooms=${localRooms.length} ` +
          `sampleSpaceNumbers=${[...spaceById.values()]
            .slice(0, 10)
            .map((s) => s.Number ?? "(no number)")
            .join(",")} ` +
          `sampleLocalRoomNumbers=${localRooms
            .slice(0, 10)
            .map((r) => r.number)
            .join(",")} ` +
          `sampleReservationAssignments=${sampleReservations
            .map(
              (r) =>
                `${r.Number}:resourceId=${r.AssignedResourceId ?? "none"},spaceId=${r.AssignedSpaceId ?? "none"}`,
            )
            .join(" | ")}`,
      );
    }

    const resolveRoomId = (r: MewsReservation): string | null => {
      // Support both old (AssignedSpaceId) and new (AssignedResourceId) field.
      const spaceId = r.AssignedResourceId ?? r.AssignedSpaceId;
      if (!spaceId) return null;
      const space = spaceById.get(spaceId);
      // Old Mews API uses space.Number; new Resources API uses space.Name.
      // Fall back to Name so either version resolves correctly.
      const roomKey = space?.Number?.trim() || space?.Name?.trim();
      if (!roomKey) return null;
      return roomIdByNumber.get(roomKey) ?? null;
    };

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

      const resolvedRoomId = resolveRoomId(r);

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
            // Only overwrite roomId when Mews has a room assigned — never
            // null-out a manual assignment made in the operator calendar.
            ...(resolvedRoomId ? { roomId: resolvedRoomId } : {}),
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
            roomId: resolvedRoomId,
            ...common,
          },
        });
      }
      upserted++;
    }

    return { propertyId, fetched: Reservations.length, upserted };
  }

  /**
   * Debug helper: returns raw Mews spaces + reservation room-assignment stats
   * for a property so you can verify the mapping without trawling logs.
   */
  async debugRoomMapping(propertyId: string) {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
    });
    if (!property) throw new Error("Property not found");
    const creds = this.resolveCreds(property);
    if (!creds) throw new Error("No Mews credentials for this property");

    const { accessToken, enterpriseId } = creds;
    const now = Date.now();

    // Fetch reservations (short window for speed)
    const raw = await reservationsGetAll(accessToken, {
      enterpriseId,
      startUtc: new Date(now - 7 * 86400000).toISOString(),
      endUtc: new Date(now + 30 * 86400000).toISOString(),
    });

    // Also try the dedicated spaces endpoint
    const allSpaces = await spacesGetAll(accessToken, { enterpriseId });

    const localRooms = await this.prisma.room.findMany({
      where: { propertyId },
      select: { id: true, number: true },
    });

    const spaceById = new Map(raw.Spaces.map((s) => [s.Id, s]));
    const withRoom = raw.Reservations.filter(
      (r) => r.AssignedSpaceId ?? r.AssignedResourceId,
    );

    return {
      mewsSpacesFromReservationsExtent: raw.Spaces.length,
      mewsSpacesFromDedicatedEndpoint: allSpaces.length,
      sampleSpaces: [...allSpaces, ...raw.Spaces]
        .slice(0, 10)
        .map((s) => ({ id: s.Id, number: s.Number, name: s.Name, resolvedKey: s.Number?.trim() || s.Name?.trim() })),
      totalReservations: raw.Reservations.length,
      reservationsWithAssignedRoom: withRoom.length,
      sampleAssignments: withRoom.slice(0, 5).map((r) => ({
        reservationId: r.Id,
        assignedSpaceId: r.AssignedSpaceId ?? r.AssignedResourceId,
        spaceName: spaceById.get(
          (r.AssignedSpaceId ?? r.AssignedResourceId) as string,
        )?.Number,
      })),
      localRoomsCount: localRooms.length,
      sampleLocalRooms: localRooms.slice(0, 10).map((r) => r.number),
    };
  }

  /** Return whether the global Mews CLIENT_TOKEN env var is set. */
  getConfig() {
    return { configured: mewsConfigured() };
  }

  /**
   * Return Mews connection status for one property (or all Mews-backed ones).
   * Lightweight — just reads DB; does not call Mews.
   */
  async getStatus(propertyId?: string) {
    const where = propertyId
      ? { id: propertyId }
      : { OR: [{ mewsAccessToken: { not: null } }, { mewsEnterpriseId: { not: null } }] };

    const properties = await this.prisma.property.findMany({
      where,
      select: {
        id: true,
        slug: true,
        name: true,
        mewsEnterpriseId: true,
        mewsAccessToken: true,
      },
    });

    return properties.map((p) => ({
      propertyId: p.id,
      slug: p.slug,
      name: p.name,
      configured: !!this.resolveCreds(p),
      hasEnterpriseId: !!p.mewsEnterpriseId,
      hasAccessToken: !!p.mewsAccessToken,
    }));
  }

  /**
   * Persist Mews credentials on a property. Passing an empty string clears
   * the field so it falls back to the shared env vars.
   */
  async saveCredentials(
    propertyId: string,
    accessToken: string,
    enterpriseId?: string,
  ) {
    const property = await this.prisma.property.update({
      where: { id: propertyId },
      data: {
        mewsAccessToken: accessToken || null,
        mewsEnterpriseId: enterpriseId ?? null,
      },
      select: { id: true, slug: true, mewsEnterpriseId: true },
    });
    return { saved: true, propertyId: property.id };
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
