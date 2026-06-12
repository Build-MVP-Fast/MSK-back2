import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';

import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;
  private resendApiKey: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    // Prefer Resend's HTTP API over SMTP — the SMTP path on Render's
    // free tier kept timing out at the TCP handshake on both port 465
    // and 587, leaving emails silently undelivered. The HTTP API bypasses
    // SMTP entirely. Resend's SMTP password IS the API key (re_…), so
    // RESEND_API_KEY is optional — we fall back to SMTP_PASS if it isn't
    // explicitly set.
    const explicit = this.config.get<string>('RESEND_API_KEY');
    const smtpPass = this.config.get<string>('SMTP_PASS');
    const candidate = explicit ?? (smtpPass && smtpPass.startsWith('re_') ? smtpPass : null);
    if (candidate) {
      this.resendApiKey = candidate;
      this.logger.log('Email transport: Resend HTTP API');
    }

    // SMTP transport stays wired as a fallback for non-Resend providers
    // or if a future deploy explicitly opts out by unsetting the API key.
    const host = this.config.get<string>('SMTP_HOST');
    if (host && !this.resendApiKey) {
      const port = Number(this.config.get<string>('SMTP_PORT')) || 587;
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: {
          user: this.config.get<string>('SMTP_USER'),
          pass: smtpPass,
        },
        // Tight timeouts so a hung handshake fails fast instead of
        // chewing through the request's own AbortController budget.
        connectionTimeout: 15_000,
        greetingTimeout: 15_000,
        socketTimeout: 20_000,
      });
      this.logger.log('Email transport: SMTP (no Resend API key found)');
    }
  }

  /**
   * Send an HTML email.
   *
   * @param from — optional override for the From header. Falls back to
   *               the `SMTP_FROM` env var. Used by the booking flow to
   *               force `reservation@mskguestbook.com` regardless of the
   *               general `SMTP_FROM` (which OTP / password-reset emails
   *               keep using).
   */
  async send(to: string, subject: string, html: string, from?: string) {
    const fromAddr = from ?? this.config.get<string>('SMTP_FROM');
    if (!fromAddr) {
      this.logger.error(
        `SMTP_FROM is not configured — would have sent to=${to} subject="${subject}".`,
      );
      return;
    }

    if (this.resendApiKey) {
      await this.sendViaResend(to, subject, html, fromAddr);
      return;
    }

    if (this.transporter) {
      await this.transporter.sendMail({ from: fromAddr, to, subject, html });
      return;
    }

    this.logger.error(
      `No email transport configured — would have sent to=${to} subject="${subject}". ` +
        `Set RESEND_API_KEY (or SMTP_HOST/PORT/USER/PASS) on the deployment.`,
    );
  }

  /**
   * POST to Resend's HTTPS /emails endpoint. Used in place of SMTP when
   * a Resend API key is present, which is now the default on this
   * deployment. Times out at 15s — well below the calling code's own
   * 30-60s envelope — so an unreachable Resend never wedges the request.
   */
  private async sendViaResend(
    to: string,
    subject: string,
    html: string,
    from: string,
  ): Promise<void> {
    let res: Response;
    try {
      res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.resendApiKey}`,
        },
        body: JSON.stringify({ from, to, subject, html }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      this.logger.error(
        `Resend HTTP send threw to=${to} subject="${subject}": ${err instanceof Error ? err.message : err}`,
      );
      throw err;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      this.logger.error(
        `Resend rejected to=${to} subject="${subject}" status=${res.status} body=${body.slice(0, 500)}`,
      );
      throw new Error(`Resend HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    const json = (await res.json().catch(() => null)) as { id?: string } | null;
    this.logger.log(`Resend send ok id=${json?.id ?? '?'} to=${to}`);
  }

  async sendToUser(userId: string, subject: string, html: string, from?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.email) return;
    return this.send(user.email, subject, html, from);
  }
}
