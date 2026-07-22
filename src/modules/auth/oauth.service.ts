import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';

export interface VerifiedOAuthIdentity {
  providerUserId: string;
  email: string | null;
  emailVerified: boolean;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
}

const GOOGLE_ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);
const APPLE_ISSUER = 'https://appleid.apple.com';

@Injectable()
export class OAuthService {
  private readonly googleJwks = createRemoteJWKSet(
    new URL('https://www.googleapis.com/oauth2/v3/certs'),
  );
  private readonly appleJwks = createRemoteJWKSet(
    new URL('https://appleid.apple.com/auth/keys'),
  );

  constructor(private readonly config: ConfigService) {}

  async verifyGoogleIdToken(idToken: string): Promise<VerifiedOAuthIdentity> {
    const audiences = this.config.get<string[]>('oauth.googleClientIds') ?? [];
    if (!audiences.length) {
      throw new UnauthorizedException('Google sign-in is not configured');
    }

    let payload: JWTPayload;
    try {
      const result = await jwtVerify(idToken, this.googleJwks, {
        audience: audiences,
      });
      payload = result.payload;
    } catch {
      throw new UnauthorizedException('Invalid Google token');
    }

    const iss = typeof payload.iss === 'string' ? payload.iss : '';
    if (!GOOGLE_ISSUERS.has(iss)) {
      throw new UnauthorizedException('Invalid Google token issuer');
    }

    const sub = typeof payload.sub === 'string' ? payload.sub : '';
    if (!sub) throw new UnauthorizedException('Invalid Google token');

    const email =
      typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : null;
    const emailVerified =
      payload.email_verified === true || payload.email_verified === 'true';

    const given =
      typeof payload.given_name === 'string' ? payload.given_name : null;
    const family =
      typeof payload.family_name === 'string' ? payload.family_name : null;
    const name = typeof payload.name === 'string' ? payload.name : null;

    return {
      providerUserId: sub,
      email,
      emailVerified,
      firstName: given,
      lastName: family,
      fullName: name ?? ([given, family].filter(Boolean).join(' ') || null),
    };
  }

  async verifyAppleIdentityToken(
    identityToken: string,
    fallbackEmail?: string | null,
  ): Promise<VerifiedOAuthIdentity> {
    const audience =
      this.config.get<string>('oauth.appleClientId') ?? 'com.msk.mobile';

    let payload: JWTPayload;
    try {
      const result = await jwtVerify(identityToken, this.appleJwks, {
        audience,
        issuer: APPLE_ISSUER,
      });
      payload = result.payload;
    } catch {
      throw new UnauthorizedException('Invalid Apple token');
    }

    const sub = typeof payload.sub === 'string' ? payload.sub : '';
    if (!sub) throw new UnauthorizedException('Invalid Apple token');

    const tokenEmail =
      typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : null;
    const email = tokenEmail ?? (fallbackEmail?.trim().toLowerCase() || null);
    const emailVerified =
      payload.email_verified === true ||
      payload.email_verified === 'true' ||
      !!tokenEmail;

    return {
      providerUserId: sub,
      email,
      emailVerified,
    };
  }
}
