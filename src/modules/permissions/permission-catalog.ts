import { UserRole } from '@prisma/client';

// ──────────────────────────────────────────────────────────────────────
// Permission catalog
// ──────────────────────────────────────────────────────────────────────
//
// Every togglable feature in the admin is a row here. The seed routine
// in PermissionsService uses these to upsert the Permission table on
// every backend boot, so adding a new permission is a one-line change
// to this file (no migration needed).
//
// Naming convention: `<feature>.<verb>` — keep verbs to a small set
// (read / create / update / delete / publish / specific actions) so the
// matrix UI groups them cleanly.

export interface PermissionDef {
  code: string;
  label: string;
  group: string;
  description?: string;
  ordering: number;
}

export const PERMISSION_CATALOG: PermissionDef[] = [
  // ── Bookings ─────────────────────────────────────────────────────────
  { code: 'bookings.read',          group: 'Bookings', label: 'View bookings',                                  ordering: 0 },
  { code: 'bookings.create',        group: 'Bookings', label: 'Create bookings',                                ordering: 1 },
  { code: 'bookings.update',        group: 'Bookings', label: 'Edit bookings',                                  ordering: 2 },
  { code: 'bookings.cancel',        group: 'Bookings', label: 'Cancel bookings',                                ordering: 3 },
  { code: 'bookings.check-in',      group: 'Bookings', label: 'Check in guests',                                ordering: 4 },
  { code: 'bookings.check-out',     group: 'Bookings', label: 'Check out guests',                               ordering: 5 },
  { code: 'bookings.assign-room',   group: 'Bookings', label: 'Assign or unassign rooms',                       ordering: 6 },
  { code: 'bookings.move-dates',    group: 'Bookings', label: 'Move dates on calendar (horizontal drag)',       ordering: 7,
    description: 'Drag a reservation to extend or shorten its dates on the reservations calendar.' },
  { code: 'bookings.move-room',     group: 'Bookings', label: 'Move to another room (vertical drag)',           ordering: 8,
    description: 'Drag a reservation to a different room row on the reservations calendar.' },
  { code: 'bookings.delete',        group: 'Bookings', label: 'Delete bookings',                                ordering: 9 },

  // ── Properties / Rooms / Room Types ─────────────────────────────────
  { code: 'properties.read',        group: 'Properties', label: 'View properties',          ordering: 0 },
  { code: 'properties.create',      group: 'Properties', label: 'Create properties',        ordering: 1 },
  { code: 'properties.update',      group: 'Properties', label: 'Edit properties',          ordering: 2 },
  { code: 'properties.publish',     group: 'Properties', label: 'Publish / unpublish',      ordering: 3 },
  { code: 'properties.photos',      group: 'Properties', label: 'Manage property photos',   ordering: 4 },
  { code: 'properties.delete',      group: 'Properties', label: 'Delete / archive properties', ordering: 5 },
  { code: 'rooms.read',             group: 'Rooms', label: 'View rooms',                    ordering: 0 },
  { code: 'rooms.create',           group: 'Rooms', label: 'Create rooms',                  ordering: 1 },
  { code: 'rooms.update',           group: 'Rooms', label: 'Edit rooms',                    ordering: 2 },
  { code: 'rooms.delete',           group: 'Rooms', label: 'Delete rooms',                  ordering: 3 },
  { code: 'room-types.read',        group: 'Room Types', label: 'View room types',          ordering: 0 },
  { code: 'room-types.create',      group: 'Room Types', label: 'Create room types',        ordering: 1 },
  { code: 'room-types.update',      group: 'Room Types', label: 'Edit room types',          ordering: 2 },
  { code: 'room-types.delete',      group: 'Room Types', label: 'Delete room types',        ordering: 3 },

  // ── Pricing & Availability ───────────────────────────────────────────
  { code: 'availability.read',      group: 'Pricing & Availability', label: 'View availability calendar', ordering: 0 },
  { code: 'availability.update',    group: 'Pricing & Availability', label: 'Edit availability',          ordering: 1 },
  { code: 'pricing.read',           group: 'Pricing & Availability', label: 'View pricing',               ordering: 2 },
  { code: 'pricing.update',         group: 'Pricing & Availability', label: 'Edit pricing',               ordering: 3 },

  // ── Users ────────────────────────────────────────────────────────────
  { code: 'users.read',                group: 'Users', label: 'View users',                              ordering: 0 },
  { code: 'users.create',              group: 'Users', label: 'Create users',                            ordering: 1 },
  { code: 'users.update',              group: 'Users', label: 'Edit users',                              ordering: 2 },
  { code: 'users.assign-role',         group: 'Users', label: 'Change user role',                        ordering: 3 },
  { code: 'users.edit-permissions',    group: 'Users', label: 'Edit role permissions & user overrides', ordering: 4,
    description: 'Access the permissions matrix and per-user override editor.' },
  { code: 'users.delete',              group: 'Users', label: 'Delete users',                            ordering: 5 },

  // ── Careers ─────────────────────────────────────────────────────────
  { code: 'careers.jobs.read',         group: 'Careers', label: 'View job postings',         ordering: 0 },
  { code: 'careers.jobs.create',       group: 'Careers', label: 'Create job postings',       ordering: 1 },
  { code: 'careers.jobs.update',       group: 'Careers', label: 'Edit job postings',         ordering: 2 },
  { code: 'careers.jobs.delete',       group: 'Careers', label: 'Delete job postings',       ordering: 3 },
  { code: 'careers.applications.read', group: 'Careers', label: 'View job applications',     ordering: 4 },
  { code: 'careers.applications.update', group: 'Careers', label: 'Update application status', ordering: 5 },

  // ── Inquiries ───────────────────────────────────────────────────────
  { code: 'inquiries.contact.read',    group: 'Inquiries', label: 'View support inquiries',                ordering: 0 },
  { code: 'inquiries.contact.update',  group: 'Inquiries', label: 'Respond to / status support inquiries', ordering: 1 },
  { code: 'inquiries.partner.read',    group: 'Inquiries', label: 'View partner inquiries',                ordering: 2 },
  { code: 'inquiries.partner.update',  group: 'Inquiries', label: 'Update partner inquiry status',         ordering: 3 },
  { code: 'inquiries.newsletter.read', group: 'Inquiries', label: 'View newsletter subscribers',           ordering: 4 },

  // ── Waitlist / Guestbook ────────────────────────────────────────────
  { code: 'waitlist.read',             group: 'Guestbook', label: 'View waitlist signups',  ordering: 0 },
  { code: 'waitlist.update',           group: 'Guestbook', label: 'Add internal notes',     ordering: 1 },
  { code: 'waitlist.delete',           group: 'Guestbook', label: 'Delete waitlist entries', ordering: 2 },

  // ── Site Content ────────────────────────────────────────────────────
  { code: 'content.site.read',                group: 'Content', label: 'View site content',          ordering: 0 },
  { code: 'content.site.update',              group: 'Content', label: 'Edit site content (text + images)', ordering: 1 },
  { code: 'content.faqs.read',                group: 'Content', label: 'View FAQs',                  ordering: 2 },
  { code: 'content.faqs.create',              group: 'Content', label: 'Create FAQs',                ordering: 3 },
  { code: 'content.faqs.update',              group: 'Content', label: 'Edit FAQs',                  ordering: 4 },
  { code: 'content.faqs.delete',              group: 'Content', label: 'Delete FAQs',                ordering: 5 },
  { code: 'content.faqs.import-export',       group: 'Content', label: 'Import / export FAQs (Excel)', ordering: 6 },
  { code: 'content.house-rules.read',         group: 'Content', label: 'View house rules',           ordering: 7 },
  { code: 'content.house-rules.update',       group: 'Content', label: 'Edit house rules',           ordering: 8 },
  { code: 'content.testimonials.read',        group: 'Content', label: 'View testimonials',          ordering: 9 },
  { code: 'content.testimonials.update',      group: 'Content', label: 'Edit testimonials',          ordering: 10 },
  { code: 'content.expansion-cities.read',    group: 'Content', label: 'View expansion cities',      ordering: 11 },
  { code: 'content.expansion-cities.update',  group: 'Content', label: 'Edit expansion cities',      ordering: 12 },
  { code: 'content.testing-locations.read',   group: 'Content', label: 'View testing locations',     ordering: 13 },
  { code: 'content.testing-locations.create', group: 'Content', label: 'Create testing locations',   ordering: 14 },
  { code: 'content.testing-locations.update', group: 'Content', label: 'Edit testing locations',     ordering: 15 },
  { code: 'content.testing-locations.delete', group: 'Content', label: 'Delete testing locations',   ordering: 16 },

  // ── Finance ─────────────────────────────────────────────────────────
  { code: 'finance.read',              group: 'Finance', label: 'View finance dashboards',   ordering: 0 },
  { code: 'finance.update',            group: 'Finance', label: 'Edit finance settings',     ordering: 1 },
];

// Default permission set per existing role. Used to seed RolePermission
// rows on first boot (idempotent — runSeed only inserts what's missing
// so admin edits in the matrix are never overwritten).
//
// Strategy:
//   SUPER_USER   — everything
//   ADMIN        — everything except hard-deletes + permission editing
//   RECEPTIONIST — read-only on most areas + day-to-day booking ops,
//                  including horizontal calendar move but NOT vertical
//                  move (matches the client's spec).

const RECEPTIONIST_PERMISSIONS = new Set([
  'bookings.read',
  'bookings.create',
  'bookings.update',
  'bookings.cancel',
  'bookings.check-in',
  'bookings.check-out',
  'bookings.assign-room',
  'bookings.move-dates',
  'properties.read',
  'rooms.read',
  'room-types.read',
  'availability.read',
  'pricing.read',
  'users.read',
  'careers.applications.read',
  'careers.applications.update',
  'inquiries.contact.read',
  'inquiries.partner.read',
  'inquiries.newsletter.read',
  'waitlist.read',
  'content.site.read',
  'content.faqs.read',
  'content.house-rules.read',
  'content.testimonials.read',
  'content.expansion-cities.read',
  'content.testing-locations.read',
]);

// ADMIN gets everything except these (super-user-only by default).
const ADMIN_EXCLUDED = new Set<string>([
  'properties.delete',
  'rooms.delete',
  'room-types.delete',
  'users.delete',
  'users.edit-permissions',
]);

export function defaultPermissionsForRole(role: UserRole): string[] {
  const allCodes = PERMISSION_CATALOG.map((p) => p.code);
  switch (role) {
    case 'SUPER_USER':
      return allCodes;
    case 'ADMIN':
      return allCodes.filter((c) => !ADMIN_EXCLUDED.has(c));
    case 'RECEPTIONIST':
      return allCodes.filter((c) => RECEPTIONIST_PERMISSIONS.has(c));
    case 'WEB_GUEST':
    default:
      return [];
  }
}
