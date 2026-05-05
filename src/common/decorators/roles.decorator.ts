import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export const ROLES_KEY = 'roles';
/** Restrict a route or controller to one or more roles. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
