import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpPurpose } from '@prisma/client';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';

import { PrismaService } from '../../common/prisma/prisma.service';

interface SendOtpInput {
  destination: string;
  channel: 'email' | 'sms';
  purpose: OtpPurpose;
  userId?: string;
}

interface ConsumeOtpInput {
  destination: string;
  code: string;
  purpose: OtpPurpose;
}

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Generates an OTP, persists a hashed version, and dispatches it via the
   * appropriate transport (email/SMS). Intentionally returns no information
   * about the destination beyond a boolean so callers can't enumerate users.
   */
  async send(input: SendOtpInput) {
    const length = this.config.get<number>('OTP_LENGTH', 6);
    const ttlSeconds = this.config.get<number>('OTP_TTL_SECONDS', 300);

    const code = generateNumericCode(length);
    const codeHash = await argon2.hash(code);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    await this.prisma.otpCode.create({
      data: {
        userId: input.userId,
        channel: input.channel,
        destination: input.destination,
        purpose: input.purpose,
        codeHash,
        expiresAt,
      },
    });

    // TODO: dispatch via real transport (Twilio for SMS, Nodemailer for email).
    this.logger.debug(`[OTP/${input.purpose}] code=${code} → ${input.destination}`);
    return { sent: true };
  }

  /** Consume an OTP — used internally by AuthService.resetPassword/PIN etc. */
  async consume(input: ConsumeOtpInput) {
    const record = await this.prisma.otpCode.findFirst({
      where: {
        destination: input.destination,
        purpose: input.purpose,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!record) throw new BadRequestException('OTP invalid or expired');

    const valid = await argon2.verify(record.codeHash, input.code);
    if (!valid) {
      await this.prisma.otpCode.update({
        where: { id: record.id },
        data: { attempts: record.attempts + 1 },
      });
      throw new BadRequestException('OTP invalid');
    }

    await this.prisma.otpCode.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    });

    return record;
  }

  /** External request endpoint (signup / resend). */
  async request(dto: { destination: string; channel: 'email' | 'sms'; purpose: OtpPurpose }) {
    return this.send(dto);
  }

  /** External verify endpoint — used for email/phone verification. */
  async verify(dto: { destination: string; code: string; purpose: OtpPurpose }) {
    const consumed = await this.consume(dto);
    if (consumed.userId) {
      const update =
        dto.purpose === OtpPurpose.VERIFY_EMAIL
          ? { emailVerified: true }
          : dto.purpose === OtpPurpose.VERIFY_PHONE
            ? { phoneVerified: true }
            : null;
      if (update) {
        await this.prisma.user.update({ where: { id: consumed.userId }, data: update });
      }
    }
    return { verified: true };
  }
}

function generateNumericCode(length: number): string {
  const max = 10 ** length;
  const n = crypto.randomInt(0, max);
  return n.toString().padStart(length, '0');
}
