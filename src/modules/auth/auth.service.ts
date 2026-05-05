import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthProvider, OtpPurpose, UserRole } from '@prisma/client';
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
        role: UserRole.GUEST,
        primaryRole: UserRole.GUEST,
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
