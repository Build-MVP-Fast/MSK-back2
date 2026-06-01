import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';

import { PERMISSIONS_KEY } from '../decorators/require-permission.decorator';
import { PermissionsService } from '../../modules/permissions/permissions.service';

interface AuthedRequest {
  user?: {
    id?: string;
    role?: UserRole;
    primaryRole?: UserRole;
  };
}

/**
 * Route-level permission check. Runs AFTER JwtAuthGuard, so we can
 * assume req.user has been populated. If the route doesn't declare
 * `@RequirePermission(...)` we pass through — the guard is opt-in to
 * make migration from the old @Roles system a one-route-at-a-time
 * operation.
 *
 * Resolution:
 *   - SUPER_USER short-circuit (always pass)
 *   - Otherwise, fetch effective permissions via PermissionsService and
 *     require every code on the route to be present.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionsService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(
      PERMISSIONS_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!required || required.length === 0) return true;

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const user = req.user;
    if (!user?.id || !user.role) {
      throw new ForbiddenException('Authentication required.');
    }

    // Platform owner is never permission-locked. This is intentional —
    // a misconfigured matrix should never strand the super user out of
    // the system.
    if (user.role === 'SUPER_USER' || user.primaryRole === 'SUPER_USER') {
      return true;
    }

    const effective = await this.permissions.effectivePermissions(
      user.id,
      user.primaryRole ?? user.role,
    );
    for (const code of required) {
      if (!effective.has(code)) {
        throw new ForbiddenException(
          `Missing permission: ${code}`,
        );
      }
    }
    return true;
  }
}
