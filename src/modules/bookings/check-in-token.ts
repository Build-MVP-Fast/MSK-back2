import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

export const CHECK_IN_TOKEN_SCOPE = 'check-in';
export const CHECK_IN_TOKEN_TTL = '30m';
export const CHECK_OUT_TOKEN_SCOPE = 'check-out';
export const CHECK_OUT_TOKEN_TTL = '30m';

export interface CheckInTokenPayload {
  sub: string; // bookingId
  scope: typeof CHECK_IN_TOKEN_SCOPE;
}

/**
 * Issued by the three /check-out/sign-in endpoints. The token carries
 * either a userId (when the guest signed in with email+password or
 * with an OTP'd email) or a bookingId (when they signed in with the
 * 6-digit check-in code, which identifies one booking). The handler
 * uses `mode` to know which scope of bookings the holder can act on:
 *
 *  - `mode: 'user'`    → list/operate on every CHECKED_IN booking of
 *                        that user
 *  - `mode: 'booking'` → operate on only the one booking matching the
 *                        check-in code
 */
export interface CheckOutTokenPayload {
  sub: string;
  scope: typeof CHECK_OUT_TOKEN_SCOPE;
  mode: 'user' | 'booking';
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

export function buildCheckOutToken(
  jwt: JwtService,
  sub: string,
  mode: 'user' | 'booking',
): Promise<string> {
  const payload: CheckOutTokenPayload = {
    sub,
    scope: CHECK_OUT_TOKEN_SCOPE,
    mode,
  };
  return jwt.signAsync(payload, { expiresIn: CHECK_OUT_TOKEN_TTL });
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

/**
 * Guard for the authenticated check-out endpoints. Same pattern as
 * `CheckInTokenGuard` but validates scope === 'check-out'. The token's
 * `sub` and `mode` are attached to the request as `checkOutSub` and
 * `checkOutMode` so handlers don't have to re-decode.
 */
@Injectable()
export class CheckOutTokenGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      checkOutSub?: string;
      checkOutMode?: 'user' | 'booking';
    }>();
    const auth = req.headers['authorization'];
    const header = Array.isArray(auth) ? auth[0] : auth;
    if (!header || !header.toLowerCase().startsWith('bearer ')) {
      throw new UnauthorizedException('Missing check-out token');
    }
    const token = header.slice(7).trim();
    let payload: CheckOutTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<CheckOutTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired check-out token');
    }
    if (payload.scope !== CHECK_OUT_TOKEN_SCOPE || !payload.sub) {
      throw new UnauthorizedException('Token is not scoped for check-out');
    }
    if (payload.mode !== 'user' && payload.mode !== 'booking') {
      throw new UnauthorizedException('Token is missing a valid check-out mode');
    }
    req.checkOutSub = payload.sub;
    req.checkOutMode = payload.mode;
    return true;
  }
}
