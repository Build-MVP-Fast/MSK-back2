import { Injectable, Logger } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';

import {
  defaultPermissionsForRole,
  PERMISSION_CATALOG,
} from './permission-catalog';

@Injectable()
export class PermissionsService {
  private readonly logger = new Logger(PermissionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Seed ─────────────────────────────────────────────────────────────

  /**
   * Idempotent seed run on every backend boot.
   *
   * - Upserts every Permission row from the catalog so labels and groups
   *   stay in sync with code without an admin needing to touch anything.
   * - Seeds RolePermission rows for any role that currently has no
   *   permissions assigned. Once a role has at least one row, we treat
   *   the matrix as admin-managed and never overwrite it again — this
   *   way an admin who unchecks a permission doesn't have it silently
   *   re-checked on the next deploy.
   */
  async seed(): Promise<void> {
    // Upsert the catalog.
    for (const def of PERMISSION_CATALOG) {
      await this.prisma.permission.upsert({
        where: { code: def.code },
        create: {
          code: def.code,
          label: def.label,
          group: def.group,
          description: def.description ?? null,
          ordering: def.ordering,
        },
        update: {
          label: def.label,
          group: def.group,
          description: def.description ?? null,
          ordering: def.ordering,
        },
      });
    }

    // Drop any RolePermission rows that no longer reference a catalog
    // entry (e.g. a permission we retired). Safer than leaving orphans.
    const catalogCodes = new Set(PERMISSION_CATALOG.map((p) => p.code));
    const allCurrent = await this.prisma.rolePermission.findMany({
      select: { id: true, permissionCode: true },
    });
    const stale = allCurrent
      .filter((rp) => !catalogCodes.has(rp.permissionCode))
      .map((rp) => rp.id);
    if (stale.length > 0) {
      await this.prisma.rolePermission.deleteMany({
        where: { id: { in: stale } },
      });
    }

    // Seed defaults for any role that's never been configured.
    const roles: UserRole[] = ['SUPER_USER', 'ADMIN', 'RECEPTIONIST'];
    for (const role of roles) {
      const existing = await this.prisma.rolePermission.count({ where: { role } });
      if (existing > 0) continue;

      const defaults = defaultPermissionsForRole(role);
      if (defaults.length === 0) continue;

      await this.prisma.rolePermission.createMany({
        data: defaults.map((code) => ({ role, permissionCode: code })),
        skipDuplicates: true,
      });
      this.logger.log(
        `Seeded ${defaults.length} default permissions for role ${role}`,
      );
    }
  }

  // ── Read ─────────────────────────────────────────────────────────────

  listCatalog() {
    return this.prisma.permission.findMany({
      orderBy: [{ group: 'asc' }, { ordering: 'asc' }],
    });
  }

  /** Permission codes attached to a single role (defaults + admin edits). */
  async listRolePermissions(role: UserRole): Promise<string[]> {
    const rows = await this.prisma.rolePermission.findMany({
      where: { role },
      select: { permissionCode: true },
    });
    return rows.map((r) => r.permissionCode);
  }

  /** Full matrix: { role → permissionCode[] } for the admin UI. */
  async listAllRolePermissions(): Promise<Record<string, string[]>> {
    const rows = await this.prisma.rolePermission.findMany({
      select: { role: true, permissionCode: true },
    });
    const map: Record<string, string[]> = {};
    for (const r of rows) {
      (map[r.role] ??= []).push(r.permissionCode);
    }
    return map;
  }

  async listUserOverrides(userId: string) {
    return this.prisma.userPermissionOverride.findMany({
      where: { userId },
      select: { permissionCode: true, granted: true },
    });
  }

  /**
   * Effective permissions for a user. This is the function every guard
   * calls on every request — keep it cheap (one query each).
   *
   *   effective = role permissions + grants − revokes
   */
  async effectivePermissions(
    userId: string,
    role: UserRole,
  ): Promise<Set<string>> {
    const [roleRows, overrides] = await Promise.all([
      this.prisma.rolePermission.findMany({
        where: { role },
        select: { permissionCode: true },
      }),
      this.prisma.userPermissionOverride.findMany({
        where: { userId },
        select: { permissionCode: true, granted: true },
      }),
    ]);
    const set = new Set(roleRows.map((r) => r.permissionCode));
    for (const o of overrides) {
      if (o.granted) set.add(o.permissionCode);
      else set.delete(o.permissionCode);
    }
    return set;
  }

  /**
   * Same as effectivePermissions but takes only a userId — looks up the
   * user's role internally. Returns null if the user doesn't exist.
   */
  async effectivePermissionsByUserId(userId: string): Promise<string[] | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, primaryRole: true },
    });
    if (!user) return null;
    const role = user.primaryRole ?? user.role;
    const set = await this.effectivePermissions(userId, role);
    return Array.from(set).sort();
  }

  // ── Write ────────────────────────────────────────────────────────────

  /**
   * Replace a role's permission set with `codes`. Used by the matrix UI
   * when an admin saves a row. Done in a transaction so a partial save
   * never leaves the role half-updated.
   */
  async setRolePermissions(role: UserRole, codes: string[]): Promise<void> {
    const unique = Array.from(new Set(codes));
    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { role } }),
      this.prisma.rolePermission.createMany({
        data: unique.map((permissionCode) => ({ role, permissionCode })),
        skipDuplicates: true,
      }),
    ]);
  }

  /**
   * Set a per-user override. `mode` semantics:
   *   "grant"   — explicit grant (granted=true) regardless of role
   *   "revoke"  — explicit revoke (granted=false) regardless of role
   *   "clear"   — remove the override so the role default applies again
   */
  async setUserOverride(
    userId: string,
    permissionCode: string,
    mode: 'grant' | 'revoke' | 'clear',
  ): Promise<void> {
    if (mode === 'clear') {
      await this.prisma.userPermissionOverride.deleteMany({
        where: { userId, permissionCode },
      });
      return;
    }
    const granted = mode === 'grant';
    await this.prisma.userPermissionOverride.upsert({
      where: { userId_permissionCode: { userId, permissionCode } },
      create: { userId, permissionCode, granted },
      update: { granted },
    });
  }
}
