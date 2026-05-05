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
      const port = this.config.get<number>('SMTP_PORT', 587);
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

  async send(to: string, subject: string, html: string) {
    if (!this.transporter) {
      this.logger.warn(`SMTP not configured. Would send to=${to} subject="${subject}"`);
      return;
    }
    await this.transporter.sendMail({
      from: this.config.get<string>('SMTP_FROM'),
      to,
      subject,
      html,
    });
  }

  async sendToUser(userId: string, subject: string, html: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.email) return;
    return this.send(user.email, subject, html);
  }
}
