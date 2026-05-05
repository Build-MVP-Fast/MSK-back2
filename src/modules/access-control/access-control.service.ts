import { Injectable } from '@nestjs/common';
import { AccessGrantStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class AccessControlService {
  constructor(private readonly prisma: PrismaService) {}

  list(filter: { userId?: string; resourceType?: string } = {}) {
    return this.prisma.accessGrant.findMany({
      where: {
        ...(filter.userId && { userId: filter.userId }),
        ...(filter.resourceType && { resourceType: filter.resourceType }),
      },
      include: { user: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  grant(dto: {
    userId: string;
    resourceType: string;
    resourceId?: string;
    scope?: any;
    grantedById?: string;
    startsAt?: Date;
    endsAt?: Date;
  }) {
    return this.prisma.accessGrant.create({ data: dto });
  }

  revoke(id: string) {
    return this.prisma.accessGrant.update({
      where: { id },
      data: { status: AccessGrantStatus.REVOKED },
    });
  }

  /** RBAC helpers. */
  listRoles() {
    return this.prisma.roleDefinition.findMany({ include: { permissions: { include: { permission: true } } } });
  }

  createRole(dto: Prisma.RoleDefinitionCreateInput) {
    return this.prisma.roleDefinition.create({ data: dto });
  }

  attachPermission(roleId: string, permissionId: string) {
    return this.prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId, permissionId } },
      create: { roleId, permissionId },
      update: {},
    });
  }

  detachPermission(roleId: string, permissionId: string) {
    return this.prisma.rolePermission.delete({
      where: { roleId_permissionId: { roleId, permissionId } },
    });
  }

  assignRole(userId: string, roleId: string, scope?: { type: string; id?: string }) {
    return this.prisma.userRoleAssignment.upsert({
      where: {
        userId_roleId_scopeType_scopeId: {
          userId,
          roleId,
          scopeType: scope?.type ?? null as any,
          scopeId: scope?.id ?? null as any,
        },
      },
      create: { userId, roleId, scopeType: scope?.type, scopeId: scope?.id },
      update: {},
    });
  }
}
