import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccountKind, AuthProvider, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';

import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Boot-time seed for the App Store Review demo guest account.
 *
 * Apple requires a working username/password in App Review Information.
 * Guest login is normally OTP/Apple/Google — this account is a real
 * WEB_GUEST (APP lane) with a PASSWORD credential so reviewers can sign
 * in via the mobile "email & password" path without mailbox access.
 *
 * Defaults (override with env if you want to rotate):
 *   APPLE_REVIEW_EMAIL     — default apple.review@mskguestbook.com
 *   APPLE_REVIEW_PASSWORD  — default MskReview2026!
 *
 * Always runs (unlike DevUserSeed) so prod always has a review account
 * after deploy. Marked isHidden so it doesn't pollute staff lists.
 */
export const APPLE_REVIEW_DEFAULTS = {
  email: 'apple.review@mskguestbook.com',
  password: 'MskReview2026!',
  firstName: 'Apple',
  lastName: 'Reviewer',
} as const;

@Injectable()
export class AppleReviewUserSeed implements OnApplicationBootstrap {
  private readonly logger = new Logger(AppleReviewUserSeed.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap() {
    // Allow ops to disable with APPLE_REVIEW_SEED=0 if needed.
    const enabled = (this.config.get<string>('APPLE_REVIEW_SEED') ?? '1').trim();
    if (enabled === '0' || enabled.toLowerCase() === 'false') {
      this.logger.log('Apple Review guest seed disabled (APPLE_REVIEW_SEED=0)');
      return;
    }

    const email = (
      this.config.get<string>('APPLE_REVIEW_EMAIL') ?? APPLE_REVIEW_DEFAULTS.email
    )
      .trim()
      .toLowerCase();
    const password = (
      this.config.get<string>('APPLE_REVIEW_PASSWORD') ??
      APPLE_REVIEW_DEFAULTS.password
    ).trim();

    if (!email || !password || password.length < 8) {
      this.logger.warn('Apple Review seed skipped — invalid email/password');
      return;
    }

    const firstName =
      this.config.get<string>('APPLE_REVIEW_FIRST_NAME')?.trim() ||
      APPLE_REVIEW_DEFAULTS.firstName;
    const lastName =
      this.config.get<string>('APPLE_REVIEW_LAST_NAME')?.trim() ||
      APPLE_REVIEW_DEFAULTS.lastName;
    const secretHash = await argon2.hash(password);

    const existing = await this.prisma.user.findFirst({
      where: { email, role: UserRole.WEB_GUEST },
      include: { credentials: true, guestProfile: true },
    });

    if (!existing) {
      await this.prisma.user.create({
        data: {
          email,
          firstName,
          lastName,
          fullName: `${firstName} ${lastName}`.trim(),
          role: UserRole.WEB_GUEST,
          primaryRole: UserRole.WEB_GUEST,
          accountKind: AccountKind.APP,
          authProvider: AuthProvider.PASSWORD,
          emailVerified: true,
          isActive: true,
          isHidden: true,
          guestProfile: { create: {} },
          credentials: {
            create: {
              provider: AuthProvider.PASSWORD,
              secretHash,
            },
          },
        },
      });
      this.logger.log(`Created Apple Review WEB_GUEST ${email}`);
      return;
    }

    await this.prisma.user.update({
      where: { id: existing.id },
      data: {
        role: UserRole.WEB_GUEST,
        primaryRole: UserRole.WEB_GUEST,
        accountKind: AccountKind.APP,
        authProvider: AuthProvider.PASSWORD,
        emailVerified: true,
        isActive: true,
        isHidden: true,
        deletedAt: null,
        firstName,
        lastName,
        fullName: `${firstName} ${lastName}`.trim(),
      },
    });

    if (!existing.guestProfile) {
      await this.prisma.guestProfile.create({ data: { userId: existing.id } });
    }

    // Keep password in sync with env/defaults so rotating APPLE_REVIEW_PASSWORD
    // + redeploy always works for App Review.
    await this.prisma.userCredential.upsert({
      where: {
        userId_provider: {
          userId: existing.id,
          provider: AuthProvider.PASSWORD,
        },
      },
      update: { secretHash },
      create: {
        userId: existing.id,
        provider: AuthProvider.PASSWORD,
        secretHash,
      },
    });
    this.logger.log(`Synced Apple Review WEB_GUEST ${email}`);
  }
}
