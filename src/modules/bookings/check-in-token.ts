import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

export const CHECK_IN_TOKEN_SCOPE = 'check-in';
export const CHECK_IN_TOKEN_TTL = '30m';

export interface CheckInTokenPayload {
  sub: string; // bookingId
  scope: typeof CHECK_IN_TOKEN_SCOPE;
}

/**
 * Issued by the verify-step of the guest-wizard check-in flow. Scope is
 * deliberately narrow — these tokens authorise the holder to act on a
 * single booking's check-in endpoints and nothing else. Verified by
 * `CheckInTokenGuard` below.
 */
export function buildCheckInToken(
  jwt: JwtService,
  bookingId: string,
): Promise<string> {
  const payload: CheckInTokenPayload = {
    sub: bookingId,
    scope: CHECK_IN_TOKEN_SCOPE,
  };
  return jwt.signAsync(payload, { expiresIn: CHECK_IN_TOKEN_TTL });
}

/**
 * Guard for the wizard's authenticated check-in endpoints. Decodes the
 * Bearer token with the standard JwtService and asserts scope === 'check-in'.
 * Attaches `req.bookingId` so handlers don't have to re-decode.
 */
@Injectable()
export class CheckInTokenGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      bookingId?: string;
    }>();
    const auth = req.headers['authorization'];
    const header = Array.isArray(auth) ? auth[0] : auth;
    if (!header || !header.toLowerCase().startsWith('bearer ')) {
      throw new UnauthorizedException('Missing check-in token');
    }
    const token = header.slice(7).trim();
    let payload: CheckInTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<CheckInTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired check-in token');
    }
    if (payload.scope !== CHECK_IN_TOKEN_SCOPE || !payload.sub) {
      throw new UnauthorizedException('Token is not scoped for check-in');
    }
    req.bookingId = payload.sub;
    return true;
  }
}
