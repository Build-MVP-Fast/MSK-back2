import { Injectable } from '@nestjs/common';
import { AccessGrantStatus } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';

// The RBAC helpers that used to live here (listRoles / createRole /
// attachPermission / detachPermission / assignRole) were retired when
// the granular feature-permission system replaced the old RoleDefinition
// scaffold. Per-role permission management is now in PermissionsModule;
// per-user role assignment is handled directly on the User row.
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
}
