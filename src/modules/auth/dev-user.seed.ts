import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthProvider, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';

import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Boot-time seed for a single hidden developer SUPER_USER account.
 *
 * Driven by two env vars so credentials never live in git:
 *   DEV_USER_EMAIL  — e.g. dev@msk.local
 *   DEV_USER_PIN    — 4–6 digit PIN used at /auth/login/pin
 *
 * If either is missing, the seed is a no-op — so prod environments
 * that don't set them never get an unexpected account. When both are
 * set the user is created if missing, or its PIN is refreshed to match
 * if it already exists (so rotating the PIN is just "change env var,
 * redeploy"). Role is force-pinned to SUPER_USER on every boot to
 * heal any accidental role downgrade made through the admin UI.
 *
 * This account is "hidden" only in the sense that the credentials live
 * outside the repo. It still appears in the admin Users list — it
 * isn't a stealth backdoor.
 */
@Injectable()
export class DevUserSeed implements OnApplicationBootstrap {
  private readonly logger = new Logger(DevUserSeed.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap() {
    const email = this.config.get<string>('DEV_USER_EMAIL')?.trim();
    const pin = this.config.get<string>('DEV_USER_PIN')?.trim();
    if (!email || !pin) return;

    // Belt-and-braces sanity check — never silently create a SUPER_USER
    // with a weak shape if someone fat-fingers the env var.
    if (!/^\d{4,6}$/.test(pin)) {
      this.logger.warn(
        `DEV_USER_PIN must be 4–6 digits; skipping dev-user seed for ${email}.`,
      );
      return;
    }

    const firstName = this.config.get<string>('DEV_USER_FIRST_NAME', 'Dev');
    const lastName = this.config.get<string>('DEV_USER_LAST_NAME', 'User');
    const secretHash = await argon2.hash(pin);

    const existing = await this.prisma.user.findUnique({
      where: { email },
      include: { credentials: true },
    });

    if (!existing) {
      await this.prisma.user.create({
        data: {
          email,
          firstName,
          lastName,
          fullName: `${firstName} ${lastName}`.trim(),
          role: UserRole.SUPER_USER,
          primaryRole: UserRole.SUPER_USER,
          authProvider: AuthProvider.PIN,
          emailVerified: true,
          isActive: true,
          credentials: {
            create: {
              provider: AuthProvider.PIN,
              secretHash,
            },
          },
        },
      });
      this.logger.log(`Created dev SUPER_USER ${email}`);
      return;
    }

    // Existing — heal role + active flags every boot. Credentials are
    // only re-seeded if the user has none of their own; if they've
    // changed their own password via /auth/change-secret we leave it
    // alone so the env-driven PIN doesn't reappear and re-grant the
    // old PIN-shape access alongside the new password.
    await this.prisma.user.update({
      where: { id: existing.id },
      data: {
        role: UserRole.SUPER_USER,
        primaryRole: UserRole.SUPER_USER,
        isActive: true,
        emailVerified: true,
        deletedAt: null,
      },
    });

    if (existing.credentials.length > 0) {
      return;
    }

    await this.prisma.userCredential.create({
      data: {
        userId: existing.id,
        provider: AuthProvider.PIN,
        secretHash,
      },
    });
    this.logger.log(`Added PIN credential to existing dev user ${email}`);
  }
}
