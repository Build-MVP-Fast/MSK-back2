import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthProvider, OtpPurpose, Prisma, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';
import { Request } from 'express';

import { PrismaService } from '../../common/prisma/prisma.service';

import { OtpService } from './otp.service';
import { TokenService } from './token.service';
import {
  LoginEmailDto,
  LoginPinDto,
  RegisterAdminDto,
  RegisterGuestDto,
  RegisterStaffDto,
  RegisterWebGuestDto,
  ReservationEnquiryDto,
  ResetPasswordDto,
  ResetPinDto,
} from './dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly otp: OtpService,
  ) {}

  // ---------------------------------------------------------------------- web

  async registerWebGuest(dto: RegisterWebGuestDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new BadRequestException('Email already registered');

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        fullName: `${dto.firstName} ${dto.lastName}`.trim(),
        role: UserRole.WEB_GUEST,
        primaryRole: UserRole.WEB_GUEST,
        authProvider: AuthProvider.PASSWORD,
        credentials: {
          create: {
            provider: AuthProvider.PASSWORD,
            secretHash: await argon2.hash(dto.password),
          },
        },
      },
    });

    await this.otp.send({
      destination: dto.email,
      channel: 'email',
      purpose: OtpPurpose.VERIFY_EMAIL,
      userId: user.id,
    });

    return this.tokens.issue(user);
  }

  /**
   * Mobile guest sign-in step 1: dispatch a LOGIN-purpose OTP to the
   * given email. We never reveal whether the account exists — same
   * `{ sent: true }` response either way — but only actually send when
   * there is a user, so unknown emails silently no-op.
   */
  async requestLoginOtp(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user && user.isActive) {
      await this.otp.send({
        destination: email,
        channel: 'email',
        purpose: OtpPurpose.LOGIN,
        userId: user.id,
      });
    }
    return { sent: true };
  }

  /**
   * Mobile guest sign-in step 2: consume the LOGIN OTP and issue auth
   * tokens. Used by the mobile sign-in-otp screen — no PIN/password
   * required because possession of the email inbox is the proof.
   */
  async loginWithOtp(email: string, code: string) {
    await this.otp.consume({
      destination: email,
      code,
      purpose: OtpPurpose.LOGIN,
    });
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) throw new UnauthorizedException('Invalid credentials');
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), emailVerified: true },
    });
    return this.tokens.issue(user);
  }

  /**
   * Mobile guest sign-in via the 6-digit check-in code printed on the
   * post-check-in success screen. Looks up the booking by code, follows
   * the user link, and issues full JWT tokens.
   *
   * Allowed booking states: PENDING / CONFIRMED / CHECKED_IN. We don't
   * gate strictly on CHECKED_IN because the code is generated at the
   * OTP-verify step, so a guest whose wizard submit failed (or who
   * picked verify-later in the prior buggy version of the wizard) would
   * otherwise be locked out of their own account. CHECKED_OUT,
   * CANCELLED, and NO_SHOW codes are still refused.
   */
  async loginWithCheckInCode(code: string) {
    // Codes are numeric in practice; trim only — uppercase is a no-op
    // for digits but keeps the door open for future alphanumeric codes
    // without changing the call sites.
    const normalized = code.trim().toUpperCase();
    const booking = await this.prisma.booking.findUnique({
      where: { checkInCode: normalized },
      include: { guestUser: true },
    });
    if (!booking) throw new UnauthorizedException('Invalid code');
    const allowed = new Set<string>(['PENDING', 'CONFIRMED', 'CHECKED_IN']);
    if (!allowed.has(booking.status)) {
      throw new UnauthorizedException('Invalid code');
    }
    if (!booking.guestUserId || !booking.guestUser) {
      throw new UnauthorizedException(
        'This code is not linked to an account yet. Sign up to continue.',
      );
    }
    if (!booking.guestUser.isActive) {
      throw new UnauthorizedException('Invalid code');
    }
    await this.prisma.user.update({
      where: { id: booking.guestUserId },
      data: { lastLoginAt: new Date() },
    });
    return this.tokens.issue(booking.guestUser);
  }

  async loginWithEmail(dto: LoginEmailDto, _req: Request) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { credentials: true },
    });
    if (!user || !user.isActive) throw new UnauthorizedException('Invalid credentials');

    const credential = user.credentials.find((c) => c.provider === AuthProvider.PASSWORD);
    if (!credential) throw new UnauthorizedException('Invalid credentials');

    const valid = await argon2.verify(credential.secretHash, dto.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return this.tokens.issue(user);
  }

  async requestPasswordReset(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Always return success — don't leak existence of accounts
    if (!user) return { sent: true };
    await this.otp.send({
      destination: email,
      channel: 'email',
      purpose: OtpPurpose.RESET_PASSWORD,
      userId: user.id,
    });
    return { sent: true };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const verification = await this.otp.consume({
      destination: dto.email,
      code: dto.code,
      purpose: OtpPurpose.RESET_PASSWORD,
    });
    const user = await this.prisma.user.findUnique({ where: { id: verification.userId! } });
    if (!user) throw new BadRequestException('User not found');

    await this.prisma.userCredential.upsert({
      where: { userId_provider: { userId: user.id, provider: AuthProvider.PASSWORD } },
      update: { secretHash: await argon2.hash(dto.newPassword) },
      create: {
        userId: user.id,
        provider: AuthProvider.PASSWORD,
        secretHash: await argon2.hash(dto.newPassword),
      },
    });
    return { reset: true };
  }

  // ---------------------------------------------------------------------- app

  async registerGuest(dto: RegisterGuestDto) {
    const user = await this.prisma.user.create({
      data: {
        phone: dto.phone,
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        fullName: `${dto.firstName ?? ''} ${dto.lastName ?? ''}`.trim() || null,
        // GUEST role was retired; a "guest" account created via PIN now
        // shares the WEB_GUEST role (same scope: book + view profile).
        role: UserRole.WEB_GUEST,
        primaryRole: UserRole.WEB_GUEST,
        authProvider: AuthProvider.PIN,
        guestProfile: { create: {} },
        credentials: {
          create: {
            provider: AuthProvider.PIN,
            secretHash: await argon2.hash(dto.pin),
          },
        },
      },
    });

    await this.otp.send({
      destination: dto.phone ?? dto.email!,
      channel: dto.phone ? 'sms' : 'email',
      purpose: OtpPurpose.VERIFY_PHONE,
      userId: user.id,
    });

    return { userId: user.id, otpSent: true };
  }

  async registerAdmin(dto: RegisterAdminDto) {
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        phone: dto.phone,
        firstName: dto.firstName,
        lastName: dto.lastName,
        fullName: `${dto.firstName} ${dto.lastName}`.trim(),
        role: UserRole.ADMIN,
        primaryRole: UserRole.ADMIN,
        authProvider: AuthProvider.PIN,
        company: dto.companyId
          ? { connect: { id: dto.companyId } }
          : {
              create: {
                name: dto.companyName ?? `${dto.firstName}'s Company`,
                slug: (dto.companyName ?? `${dto.firstName}-company`)
                  .toLowerCase()
                  .replace(/\s+/g, '-'),
              },
            },
        staffProfile: { create: { position: 'Admin' } },
        credentials: {
          create: {
            provider: AuthProvider.PIN,
            secretHash: await argon2.hash(dto.pin),
          },
        },
      },
    });

    await this.otp.send({
      destination: dto.email,
      channel: 'email',
      purpose: OtpPurpose.SIGN_UP,
      userId: user.id,
    });

    return { userId: user.id, otpSent: true };
  }

  /**
   * Mobile staff onboarding wizard registration. Creates a User with the
   * requested role (defaulting to STAFF), hashes the password, attaches a
   * minimal StaffProfile, and immediately issues auth tokens so the
   * wizard can drop the new staff member straight into the dashboard.
   */
  async registerStaff(dto: RegisterStaffDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new BadRequestException('Email already registered');
    const roleStr = dto.role ?? 'STAFF';
    const role = UserRole[roleStr as keyof typeof UserRole];
    const fullName = `${dto.firstName} ${dto.lastName}`.trim();

    // Build the metadata blob first as a plain object so any
    // serialization issue is obvious and isolated from the create call.
    const metadata: Record<string, string> = {};
    if (dto.address) metadata.address = dto.address;
    if (dto.dateOfBirth) metadata.dateOfBirth = dto.dateOfBirth;
    if (dto.selfieUrl) metadata.selfieUrl = dto.selfieUrl;
    if (dto.username) metadata.username = dto.username;

    // Attach a role-appropriate profile row. SUPPLIER gets a
    // SupplierProfile (companyName defaulted to the user's full name;
    // admin can edit later); everyone else gets a StaffProfile so
    // dashboard screens have something to read. Typed as a partial
    // UserCreateInput so we can spread it into the create call without
    // tripping TS's required-field check on the wider type.
    const profileBlock: Pick<Prisma.UserCreateInput, 'staffProfile' | 'supplierProfile'> =
      role === UserRole.SUPPLIER
        ? { supplierProfile: { create: { companyName: fullName || dto.email } } }
        : {
            staffProfile: {
              create: {
                position: roleStr.charAt(0) + roleStr.slice(1).toLowerCase(),
              },
            },
          };

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        phone: dto.phone,
        firstName: dto.firstName,
        lastName: dto.lastName,
        fullName,
        role,
        primaryRole: role,
        authProvider: AuthProvider.PASSWORD,
        emailVerified: true,
        lastLoginAt: new Date(),
        ...(Object.keys(metadata).length > 0 && {
          metadata: metadata as Prisma.InputJsonValue,
        }),
        ...profileBlock,
        credentials: {
          create: {
            provider: AuthProvider.PASSWORD,
            secretHash: await argon2.hash(dto.password),
          },
        },
      },
    });
    return this.tokens.issue(user);
  }

  async loginWithPin(dto: LoginPinDto, _req: Request) {
    const user = await this.prisma.user.findFirst({
      where: dto.phone ? { phone: dto.phone } : { email: dto.email },
      include: { credentials: true },
    });
    if (!user || !user.isActive) throw new UnauthorizedException('Invalid credentials');

    const credential = user.credentials.find((c) => c.provider === AuthProvider.PIN);
    if (!credential) throw new UnauthorizedException('Invalid credentials');

    const valid = await argon2.verify(credential.secretHash, dto.pin);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return this.tokens.issue(user);
  }

  async requestPinReset(dto: { phone?: string; email?: string }) {
    const user = await this.prisma.user.findFirst({
      where: dto.phone ? { phone: dto.phone } : { email: dto.email! },
    });
    if (!user) return { sent: true };
    await this.otp.send({
      destination: dto.phone ?? dto.email!,
      channel: dto.phone ? 'sms' : 'email',
      purpose: OtpPurpose.RESET_PIN,
      userId: user.id,
    });
    return { sent: true };
  }

  async resetPin(dto: ResetPinDto) {
    const verification = await this.otp.consume({
      destination: dto.destination,
      code: dto.code,
      purpose: OtpPurpose.RESET_PIN,
    });
    await this.prisma.userCredential.upsert({
      where: {
        userId_provider: { userId: verification.userId!, provider: AuthProvider.PIN },
      },
      update: { secretHash: await argon2.hash(dto.newPin) },
      create: {
        userId: verification.userId!,
        provider: AuthProvider.PIN,
        secretHash: await argon2.hash(dto.newPin),
      },
    });
    return { reset: true };
  }

  /**
   * Change a logged-in user's credential.
   *
   * The provider of the NEW secret is decided by the *new value's shape*,
   * not by what the account had before — so a staff member seeded with a
   * 4-digit PIN can freely upgrade to a long alphanumeric password, and
   * a web guest with a password can switch to a PIN if they prefer.
   *
   *   - 4–6 ASCII digits → stored as a PIN credential
   *   - anything else    → stored as a PASSWORD credential (must be 8+
   *                        characters; spaces and any printable symbols
   *                        allowed, no complexity rules beyond length so
   *                        the user can pick a passphrase)
   *
   * Old credentials are wiped in the same transaction so the previous
   * value can never authenticate again.
   *
   * Returns generic "Invalid credentials" on a wrong current secret so we
   * don't leak which provider the account previously used.
   */
  async changeSecret(userId: string, currentSecret: string, newSecret: string) {
    if (!currentSecret || !newSecret) {
      throw new BadRequestException('Current and new secret are required.');
    }
    if (currentSecret === newSecret) {
      throw new BadRequestException(
        'New secret must be different from the current one.',
      );
    }

    const credentials = await this.prisma.userCredential.findMany({
      where: { userId },
    });
    if (credentials.length === 0) {
      throw new BadRequestException('Account has no password set.');
    }

    // Verify the current secret against ANY of the user's stored
    // credentials — a staff member with a PIN should be able to type
    // their PIN as the current secret even though the new value will
    // be a long password.
    let currentCredentialId: string | null = null;
    for (const c of credentials) {
      if (await argon2.verify(c.secretHash, currentSecret)) {
        currentCredentialId = c.id;
        break;
      }
    }
    if (!currentCredentialId) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Decide the new credential's type from its shape, not from the
    // previous credential. This is the bit that lets a SUPER_USER seeded
    // with a 4-digit PIN finally switch to a real password.
    const looksLikePin = /^\d{4,6}$/.test(newSecret);
    const newProvider = looksLikePin ? AuthProvider.PIN : AuthProvider.PASSWORD;
    if (newProvider === AuthProvider.PASSWORD && newSecret.length < 8) {
      throw new BadRequestException(
        'New password must be at least 8 characters.',
      );
    }
    if (newProvider === AuthProvider.PASSWORD && newSecret.length > 200) {
      throw new BadRequestException(
        'New password is too long (max 200 characters).',
      );
    }

    const newHash = await argon2.hash(newSecret);

    // Replace the credential row atomically. We wipe every old
    // credential (PIN + PASSWORD if both somehow existed) so the user
    // ends up with exactly one row matching the new provider.
    await this.prisma.$transaction([
      this.prisma.userCredential.deleteMany({ where: { userId } }),
      this.prisma.userCredential.create({
        data: {
          userId,
          provider: newProvider,
          secretHash: newHash,
        },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { authProvider: newProvider },
      }),
    ]);

    return { changed: true, provider: newProvider };
  }

  // -------------------------------------------------------- reservation enquiry

  async reservationEnquiry(dto: ReservationEnquiryDto) {
    // Locates a guest by reservation reference + last-name and triggers an OTP flow.
    const booking = await this.prisma.booking.findUnique({
      where: { reference: dto.reference },
      include: { guestUser: true },
    });
    if (!booking) throw new BadRequestException('Reservation not found');

    const lastNameMatch =
      booking.guestLastName?.toLowerCase() === dto.lastName.toLowerCase() ||
      booking.guestUser?.lastName?.toLowerCase() === dto.lastName.toLowerCase();
    if (!lastNameMatch) throw new BadRequestException('Reservation not found');

    const destination = booking.guestEmail ?? booking.guestPhone;
    if (!destination) throw new BadRequestException('No contact on file for reservation');

    await this.otp.send({
      destination,
      channel: booking.guestEmail ? 'email' : 'sms',
      purpose: OtpPurpose.RESERVATION_ENQUIRY,
      userId: booking.guestUserId ?? undefined,
    });

    return { otpSent: true, contactHint: maskContact(destination) };
  }
}

function maskContact(value: string): string {
  if (value.includes('@')) {
    const [local, domain] = value.split('@');
    return `${local.slice(0, 2)}***@${domain}`;
  }
  return `${'*'.repeat(value.length - 4)}${value.slice(-4)}`;
}
