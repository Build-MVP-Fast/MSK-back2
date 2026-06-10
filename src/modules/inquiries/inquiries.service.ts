import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ContactInquiry, InquiryStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';
import { EmailService } from '../notifications/email.service';

const DEFAULT_NOTIFICATIONS_EMAIL = 'info@mskguestbook.com';

@Injectable()
export class InquiriesService {
  private readonly logger = new Logger(InquiriesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  // ---- Newsletter ---------------------------------------------------------
  subscribeNewsletter(dto: { email: string; userId?: string; source?: string }) {
    return this.prisma.newsletterSubscription.upsert({
      where: { email: dto.email },
      create: dto,
      update: { isActive: true, unsubscribedAt: null },
    });
  }

  unsubscribeNewsletter(email: string) {
    return this.prisma.newsletterSubscription.update({
      where: { email },
      data: { isActive: false, unsubscribedAt: new Date() },
    });
  }

  listNewsletter() {
    return this.prisma.newsletterSubscription.findMany({ orderBy: { createdAt: 'desc' } });
  }

  // ---- Partner inquiries (about page modal) ------------------------------
  createPartnerInquiry(dto: Prisma.PartnerInquiryUncheckedCreateInput) {
    return this.prisma.partnerInquiry.create({ data: dto });
  }

  listPartnerInquiries(status?: InquiryStatus) {
    return this.prisma.partnerInquiry.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }

  setPartnerStatus(id: string, status: InquiryStatus, notes?: string) {
    return this.prisma.partnerInquiry.update({ where: { id }, data: { status, notes } });
  }

  // ---- Contact inquiries -------------------------------------------------
  async createContactInquiry(dto: Prisma.ContactInquiryUncheckedCreateInput) {
    const inquiry = await this.prisma.contactInquiry.create({ data: dto });

    // Fire-and-forget the operator notification so a failing mailer
    // never blocks the marketing form. EmailService no-ops with a loud
    // log when SMTP_* isn't configured.
    void this.notifyContact(inquiry).catch((err) => {
      this.logger.warn(
        `Contact inquiry notification failed for ${inquiry.email}: ${err instanceof Error ? err.message : err}`,
      );
    });

    return inquiry;
  }

  private async notifyContact(inquiry: ContactInquiry) {
    const to = this.config.get<string>('NOTIFICATIONS_EMAIL') ?? DEFAULT_NOTIFICATIONS_EMAIL;
    const fields: Array<[string, string | null | undefined]> = [
      ['Full name', inquiry.fullName],
      ['Email', inquiry.email],
      ['Phone', inquiry.phone],
      ['Subject', inquiry.subject],
      ['Inquiry ID', inquiry.id],
      ['Submitted at', inquiry.createdAt.toISOString()],
    ];
    const rows = fields
      .map(
        ([label, value]) =>
          `<tr><td style="padding:6px 12px 6px 0;color:#666;font-size:13px;vertical-align:top">${escapeHtml(label)}</td><td style="padding:6px 0;color:#222;font-size:13px;vertical-align:top">${escapeHtml(value ?? '—')}</td></tr>`,
      )
      .join('');
    const messageBlock = `
      <p style="margin:16px 0 6px;color:#666;font-size:13px">Message</p>
      <div style="white-space:pre-wrap;background:#F7F7F7;border-radius:8px;padding:12px;color:#222;font-size:13px;line-height:1.5">${escapeHtml(inquiry.message)}</div>`;
    const html = `
      <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px">
        <h2 style="font-size:18px;font-weight:600;margin:0 0 16px;color:#222">New contact inquiry</h2>
        <table style="border-collapse:collapse;width:100%">${rows}</table>
        ${messageBlock}
      </div>`;
    const subject = inquiry.subject?.trim()
      ? `[MSK contact] ${inquiry.subject}`
      : `[MSK contact] ${inquiry.email}`;
    await this.email.send(to, subject, html);
  }

  listContactInquiries(status?: InquiryStatus) {
    return this.prisma.contactInquiry.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }

  setContactStatus(id: string, status: InquiryStatus, notes?: string) {
    return this.prisma.contactInquiry.update({ where: { id }, data: { status, notes } });
  }
}

function escapeHtml(value: string | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
