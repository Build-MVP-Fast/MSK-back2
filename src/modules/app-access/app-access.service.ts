import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";

import { PrismaService } from "../../common/prisma/prisma.service";
import {
  APP_MANAGED_ROLES,
  APP_PERMISSIONS,
  APP_ROLE_DEFAULTS,
} from "./app-permission-catalog";

const VALID_CODES = new Set(APP_PERMISSIONS.map((p) => p.code));

@Injectable()
export class AppAccessService {
  private seeded = false;

  constructor(private readonly prisma: PrismaService) {}

  /** Seed role defaults once, only for roles that have no rows yet. */
  private async ensureSeeded() {
    if (this.seeded) return;
    for (const [role, codes] of Object.entries(APP_ROLE_DEFAULTS)) {
      if (!codes.length) continue;
      const count = await this.prisma.appRolePermission.count({ where: { role } });
      if (count === 0) {
        await this.prisma.appRolePermission.createMany({
          data: codes.map((code) => ({ role, code })),
          skipDuplicates: true,
        });
      }
    }
    this.seeded = true;
  }

  catalog() {
    return APP_PERMISSIONS;
  }

  managedRoles() {
    return APP_MANAGED_ROLES;
  }

  async roleMatrix() {
    await this.ensureSeeded();
    const rows = await this.prisma.appRolePermission.findMany();
    const matrix: Record<string, string[]> = {};
    for (const { role } of APP_MANAGED_ROLES) matrix[role] = [];
    for (const r of rows) {
      (matrix[r.role] ??= []).push(r.code);
    }
    return { roles: APP_MANAGED_ROLES, matrix };
  }

  async setRolePermissions(role: string, codes: string[]) {
    const clean = [...new Set(codes.filter((c) => VALID_CODES.has(c)))];
    await this.prisma.$transaction([
      this.prisma.appRolePermission.deleteMany({ where: { role } }),
      this.prisma.appRolePermission.createMany({
        data: clean.map((code) => ({ role, code })),
      }),
    ]);
    return { role, codes: clean };
  }

  async userPermissions(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, fullName: true, firstName: true, lastName: true, email: true },
    });
    if (!user) throw new NotFoundException("User not found");

    const { matrix } = await this.roleMatrix();
    const roleCodes = matrix[user.role] ?? [];
    const overrides = await this.prisma.appUserPermissionOverride.findMany({
      where: { userId },
    });

    const effective = new Set(roleCodes);
    for (const o of overrides) {
      if (o.granted) effective.add(o.code);
      else effective.delete(o.code);
    }

    return {
      user: {
        id: user.id,
        role: user.role,
        name:
          user.fullName ||
          [user.firstName, user.lastName].filter(Boolean).join(" ") ||
          user.email,
      },
      roleCodes,
      overrides: overrides.map((o) => ({ code: o.code, granted: o.granted })),
      effective: [...effective],
    };
  }

  async setUserOverride(
    userId: string,
    code: string,
    mode: "grant" | "revoke" | "clear",
  ) {
    if (!VALID_CODES.has(code)) {
      throw new BadRequestException("Unknown permission code");
    }
    if (mode === "clear") {
      await this.prisma.appUserPermissionOverride.deleteMany({
        where: { userId, code },
      });
    } else {
      const granted = mode === "grant";
      await this.prisma.appUserPermissionOverride.upsert({
        where: { userId_code: { userId, code } },
        create: { userId, code, granted },
        update: { granted },
      });
    }
    return this.userPermissions(userId);
  }

  /** Users in a managed role, scoped to the caller's company. */
  usersInRole(role: string, companyId?: string) {
    return this.prisma.user.findMany({
      where: {
        role: role as UserRole,
        ...(companyId ? { companyId } : {}),
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        fullName: true,
        role: true,
      },
      take: 200,
      orderBy: { createdAt: "desc" },
    });
  }
}
