import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpPurpose } from '@prisma/client';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';

import { PrismaService } from '../../common/prisma/prisma.service';
import { EmailService } from '../notifications/email.service';

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
    private readonly email: EmailService,
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

    // Always log so dev environments without SMTP can still pull the code
    // out of the server logs.
    this.logger.debug(`[OTP/${input.purpose}] code=${code} → ${input.destination}`);

    // Best-effort email delivery. The OTP record is already persisted, so
    // a broken or slow SMTP transport must not block (or fail) the API
    // response — fire-and-forget the send. Without this, when SMTP creds
    // were wrong the request hung ~30s waiting on nodemailer and mobile
    // clients tripped their own 30s AbortController timeout, surfacing as
    // a "fetch cancelled" error to the user even though the OTP was
    // successfully generated.
    if (input.channel === 'email') {
      const { subject, html } = this.composeEmail(input.purpose, input.destination, code);
      void this.email.send(input.destination, subject, html).catch((err) => {
        this.logger.warn(
          `OTP email send failed (${input.purpose}): ${err instanceof Error ? err.message : err}`,
        );
      });
    }

    return { sent: true };
  }

  /**
   * Build subject + HTML body per OTP purpose. RESET_PASSWORD includes a
   * one-click link to msk-web's /new-password page; the token is just
   * `destination|code` base64url-encoded so the frontend can decode it
   * and POST the existing /auth/password/reset shape unchanged.
   */
  private composeEmail(
    purpose: OtpPurpose,
    destination: string,
    code: string,
  ): { subject: string; html: string } {
    // Public URL of the residence website. Used to build the password-
    // reset link in OTP emails. Configurable via WEB_PUBLIC_URL so dev
    // points at http://localhost:3000 and prod points at the real
    // domain. The fallback is the production residence domain so a
    // misconfigured deployment still sends a working link instead of a
    // stale Vercel preview.
    const webBase =
      this.config.get<string>('WEB_PUBLIC_URL') ?? 'https://www.mskresidence.com';

    if (purpose === OtpPurpose.RESET_PASSWORD) {
      const token = Buffer.from(`${destination}|${code}`).toString('base64url');
      const link = `${webBase.replace(/\/$/, '')}/new-password?token=${encodeURIComponent(token)}`;
      const html = `
        <div style="font-family:Inter,Arial,sans-serif;color:#222222;max-width:520px;margin:0 auto;padding:24px">
          <h2 style="font-size:20px;font-weight:600;margin:0 0 16px">Reset your MSK Residence password</h2>
          <p style="font-size:14px;line-height:22px;margin:0 0 20px">
            We received a request to reset your password. Click the button
            below to choose a new one. The link expires in 5 minutes and can
            only be used once.
          </p>
          <p style="margin:0 0 24px">
            <a href="${link}" style="display:inline-block;background:#A06A57;color:#FFFFFF;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600">Reset Password</a>
          </p>
          <p style="font-size:12px;line-height:18px;color:#666666;margin:0 0 8px">
            Or paste this verification code into the form: <strong>${code}</strong>
          </p>
          <p style="font-size:12px;line-height:18px;color:#666666;margin:0">
            If you didn't request this, you can ignore this email — your
            password won't change.
          </p>
        </div>`;
      return { subject: 'Reset your MSK Residence password', html };
    }

    if (purpose === OtpPurpose.VERIFY_EMAIL) {
      const html = `
        <div style="font-family:Inter,Arial,sans-serif;color:#222222;max-width:520px;margin:0 auto;padding:24px">
          <h2 style="font-size:20px;font-weight:600;margin:0 0 16px">Verify your email</h2>
          <p style="font-size:14px;line-height:22px">Your verification code is:</p>
          <p style="font-size:28px;font-weight:700;letter-spacing:4px;margin:16px 0">${code}</p>
        </div>`;
      return { subject: 'Verify your email', html };
    }

    // Generic fallback for other purposes (RESET_PIN, SIGN_UP, etc.).
    const html = `
      <div style="font-family:Inter,Arial,sans-serif;color:#222222;max-width:520px;margin:0 auto;padding:24px">
        <p style="font-size:14px;line-height:22px;margin:0 0 16px">Your one-time code:</p>
        <p style="font-size:28px;font-weight:700;letter-spacing:4px;margin:0">${code}</p>
      </div>`;
    return { subject: `Your MSK verification code`, html };
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
