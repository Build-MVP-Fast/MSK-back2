import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../decorators/current-user.decorator';

/**
 * Resolve the companyId an admin-facing list / aggregate endpoint
 * should filter by. Property Operators (ADMIN role) are tenants — they
 * must only ever see their own company's rows, even if they craft a
 * companyId query param pointing at someone else's UUID. SUPER_USER is
 * cross-tenant and can pass an explicit companyId (or undefined for
 * "everything").
 *
 * Throws ForbiddenException if an ADMIN somehow has no companyId on
 * their JWT — that should never happen for a freshly-registered
 * Property Operator, but if it does we'd rather 403 than leak data.
 */
export function companyScope(
  user: AuthenticatedUser,
  requestedCompanyId?: string,
): string | undefined {
  if (!user) throw new ForbiddenException('Not authenticated');
  if (user.role === UserRole.SUPER_USER) {
    return requestedCompanyId; // may be undefined => all companies
  }
  if (!user.companyId) {
    throw new ForbiddenException('Account not linked to a company');
  }
  return user.companyId;
}
