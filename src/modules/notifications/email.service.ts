import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';

import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const host = this.config.get<string>('SMTP_HOST');
    if (host) {
      // @nestjs/config returns the raw string from process.env regardless
      // of the type hint, so coerce explicitly. Without this, `port === 465`
      // is `"465" === 465` (false), and the transporter would attempt
      // STARTTLS on an implicit-TLS port — handshake hangs with
      // "Greeting never received".
      const port = Number(this.config.get<string>('SMTP_PORT')) || 587;
      this.transporter = nodemailer.createTransport({
        host,
        port,
        // Port 465 requires implicit TLS from connection start. Other ports
        // (587, 2525) use STARTTLS upgrade which Nodemailer handles when
        // `secure` is false. Setting it explicitly so either works without
        // surprises across providers (Resend / SendGrid / Mailgun / etc.).
        secure: port === 465,
        auth: {
          user: this.config.get<string>('SMTP_USER'),
          pass: this.config.get<string>('SMTP_PASS'),
        },
      });
    }
  }

  /**
   * Send an HTML email.
   *
   * @param from — optional override for the From header. Falls back to the
   *               `SMTP_FROM` env var. Used by the booking confirmation
   *               path to force `reservation@mskresidence.com` regardless
   *               of the general SMTP_FROM (which OTP / password-reset
   *               emails keep using).
   */
  async send(to: string, subject: string, html: string, from?: string) {
    if (!this.transporter) {
      // Loud on purpose — silent no-op here is what caused "the admin
      // says the confirmation email was sent but I never got it" to go
      // undiagnosed in prod for a week. Logged at error level so it
      // shows up on Render's default log filter.
      this.logger.error(
        `SMTP_HOST is not configured — would have sent to=${to} subject="${subject}". ` +
          `Set SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM on the deployment.`,
      );
      return;
    }
    await this.transporter.sendMail({
      from: from ?? this.config.get<string>('SMTP_FROM'),
      to,
      subject,
      html,
    });
  }

  async sendToUser(userId: string, subject: string, html: string, from?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.email) return;
    return this.send(user.email, subject, html, from);
  }
}
