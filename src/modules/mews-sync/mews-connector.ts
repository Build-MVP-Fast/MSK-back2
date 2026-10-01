// Minimal Mews Connector API client for the backend reservation mirror.
// Server-to-server: the shared ClientToken + the property's AccessToken +
// the Client name are sent in the request body per the Connector API.
//
// Env: MEWS_CONNECTOR_BASE_URL, MEWS_CLIENT_TOKEN, MEWS_CLIENT_NAME.

const BASE =
  process.env.MEWS_CONNECTOR_BASE_URL ??
  "https://api.mews-demo.com/api/connector/v1";
const CLIENT_TOKEN = process.env.MEWS_CLIENT_TOKEN ?? "";
// The website sets this as MEWS_CLIENT; accept either name.
const CLIENT_NAME =
  process.env.MEWS_CLIENT ?? process.env.MEWS_CLIENT_NAME ?? "MSK Guestbook";

export interface MewsSpace {
  Id: string;
  /** Physical room / unit number, e.g. "101" — matches Room.number locally. */
  Number?: string;
  Name?: string;
  FloorNumber?: number;
  SpaceCategoryId?: string;
}

export interface MewsReservation {
  Id: string;
  Number?: string;
  State?: string;
  StartUtc?: string;
  EndUtc?: string;
  ScheduledStartUtc?: string;
  ScheduledEndUtc?: string;
  CustomerId?: string;
  AdultCount?: number;
  ChildCount?: number;
  PersonCounts?: { AgeCategoryId?: string; Count?: number }[];
  /** Older Connector API versions use AssignedSpaceId. */
  AssignedSpaceId?: string;
  /** Newer Connector API versions use AssignedResourceId. */
  AssignedResourceId?: string;
}

export interface MewsCustomer {
  Id: string;
  FirstName?: string;
  LastName?: string;
  Email?: string;
  Phone?: string;
}

export function mewsConfigured(): boolean {
  return !!CLIENT_TOKEN;
}

async function mewsPost<T>(
  path: string,
  accessToken: string,
  body: Record<string, unknown>,
): Promise<T> {
  if (!CLIENT_TOKEN || !accessToken) {
    throw new Error("Mews credentials not configured");
  }
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ClientToken: CLIENT_TOKEN,
      AccessToken: accessToken,
      Client: CLIENT_NAME,
      ...body,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Mews ${path} ${res.status}: ${text.slice(0, 300)}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

/**
 * Reservations colliding with a UTC window, with their customers and spaces.
 * Spaces are included so the sync can map AssignedSpaceId/AssignedResourceId
 * back to a local Room via the Space.Number → Room.number match.
 */
export async function reservationsGetAll(
  accessToken: string,
  opts: { enterpriseId?: string; startUtc: string; endUtc: string },
): Promise<{
  Reservations: MewsReservation[];
  Customers: MewsCustomer[];
  Spaces: MewsSpace[];
}> {
  const body: Record<string, unknown> = {
    StartUtc: opts.startUtc,
    EndUtc: opts.endUtc,
    TimeFilter: "Colliding",
    Extent: { Reservations: true, Customers: true, Spaces: true },
    Limitation: { Count: 1000 },
  };
  if (opts.enterpriseId) body.EnterpriseIds = [opts.enterpriseId];
  const data = await mewsPost<{
    Reservations?: MewsReservation[];
    Customers?: MewsCustomer[];
    Spaces?: MewsSpace[];
  }>("/reservations/getAll", accessToken, body);
  return {
    Reservations: data.Reservations ?? [],
    Customers: data.Customers ?? [],
    Spaces: data.Spaces ?? [],
  };
}

/**
 * Push a check-in back to Mews by starting the reservation's processing.
 * Best-effort: the exact operation name can vary by Connector version, so
 * callers should tolerate failure and log it rather than break check-in.
 */
export async function reservationStart(
  accessToken: string,
  reservationId: string,
): Promise<void> {
  await mewsPost("/reservations/start", accessToken, {
    ReservationIds: [reservationId],
  });
}
