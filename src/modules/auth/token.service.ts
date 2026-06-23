import { Inject, Injectable, UnauthorizedException, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User, UserRole } from '@prisma/client';
import * as crypto from 'crypto';

import { PrismaService } from '../../common/prisma/prisma.service';
import { PermissionsService } from '../permissions/permissions.service';

@Injectable()
export class TokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @Inject(forwardRef(() => PermissionsService))
    private readonly permissions: PermissionsService,
  ) {}

  async issue(user: User) {
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      phone: user.phone,
      role: user.role,
      primaryRole: user.primaryRole,
      companyId: user.companyId,
    });

    const refreshTokenRaw = crypto.randomBytes(48).toString('hex');
    const refreshTokenHash = crypto.createHash('sha256').update(refreshTokenRaw).digest('hex');

    const ttlDays = parseInt(this.config.get<string>('JWT_REFRESH_TTL', '30d'));
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

    await this.prisma.refreshToken.create({
      data: { userId: user.id, tokenHash: refreshTokenHash, expiresAt },
    });

    // Embed effective permissions so the admin SPA can prime its cache
    // without a separate /auth/me/permissions round-trip after login.
    // SUPER_USER short-circuits to '*'. Non-staff roles ship nothing.
    let permissionCodes: string[] = [];
    if (user.primaryRole === UserRole.SUPER_USER || user.role === UserRole.SUPER_USER) {
      permissionCodes = ['*'];
    } else if (
      user.primaryRole === UserRole.ADMIN ||
      user.primaryRole === UserRole.RECEPTIONIST ||
      user.role === UserRole.ADMIN ||
      user.role === UserRole.RECEPTIONIST
    ) {
      const set = await this.permissions.effectivePermissions(
        user.id,
        (user.primaryRole ?? user.role) as UserRole,
      );
      permissionCodes = [...set].sort();
    }

    // Include metadata + firstName/lastName so the mobile auth store
    // has everything the dashboard avatars, profile screens, and
    // company-logo widgets need on first paint after sign-in. Without
    // metadata here, the client would have to round-trip /users/me on
    // every login just to render the avatar circle.
    return {
      accessToken,
      refreshToken: refreshTokenRaw,
      tokenType: 'Bearer',
      expiresIn: this.config.get<string>('JWT_ACCESS_TTL', '15m'),
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.fullName,
        role: user.role,
        primaryRole: user.primaryRole,
        companyId: user.companyId,
        metadata: user.metadata ?? null,
      },
      permissions: permissionCodes,
    };
  }

  async refresh(refreshToken: string) {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    // Rotate: revoke old, issue new
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    return this.issue(stored.user);
  }

  async revoke(userId: string, refreshToken: string) {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await this.prisma.refreshToken.updateMany({
      where: { userId, tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
