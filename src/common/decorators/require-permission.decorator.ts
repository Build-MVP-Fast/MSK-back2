import { SetMetadata } from '@nestjs/common';

// Route-level metadata key the PermissionsGuard reads. We expose a
// constant alongside the decorator so the guard never depends on a
// magic string.
export const PERMISSIONS_KEY = 'required-permissions';

/**
 * Attach one or more required permission codes to a route. The
 * PermissionsGuard checks that the authenticated user's effective set
 * is a SUPERSET — they must have ALL listed codes.
 *
 * Examples:
 *   @RequirePermission('bookings.delete')
 *   @RequirePermission('bookings.assign-room', 'rooms.read')
 *
 * SUPER_USER short-circuits the guard (always passes) so the platform
 * owner can never lock themselves out.
 */
export const RequirePermission = (...codes: string[]) =>
  SetMetadata(PERMISSIONS_KEY, codes);
