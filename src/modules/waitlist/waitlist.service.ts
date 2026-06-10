import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, WaitlistEntry } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';
import { EmailService } from '../notifications/email.service';

export interface CreateWaitlistInput {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  role?: string | null;
  propertyCount?: number | null;
  unitCount?: number | null;
  phone?: string | null;
  source?: string | null;
}

const DEFAULT_NOTIFICATIONS_EMAIL = 'info@mskguestbook.com';

@Injectable()
export class WaitlistService {
  private readonly logger = new Logger(WaitlistService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Public signup. Treats re-submits as idempotent — if the email already
   * exists we update the latest details rather than throwing. The
   * marketing form is the only caller and a 200 response keeps the UX
   * silent for repeat submitters.
   *
   * `fullName` is derived from first + last so legacy admin views that
   * read it (and old rows) display cleanly without a per-entry branch.
   */
  async signup(input: CreateWaitlistInput) {
    const email = input.email.trim().toLowerCase();
    const firstName = input.firstName?.trim() || null;
    const lastName = input.lastName?.trim() || null;
    const fullName =
      firstName || lastName
        ? [firstName, lastName].filter(Boolean).join(' ').trim() || null
        : null;

    const data = {
      email,
      firstName,
      lastName,
      fullName,
      role: input.role?.trim() || null,
      propertyCount:
        input.propertyCount === null || input.propertyCount === undefined
          ? null
          : input.propertyCount,
      unitCount:
        input.unitCount === null || input.unitCount === undefined
          ? null
          : input.unitCount,
      phone: input.phone?.trim() || null,
      source: input.source?.trim() || null,
    };

    const entry = await this.prisma.waitlistEntry.upsert({
      where: { email },
      create: data,
      update: {
        // Preserve original source; only update mutable details. Use
        // `undefined` rather than `null` so an unsent field doesn't
        // wipe an existing value on re-submit.
        firstName: data.firstName ?? undefined,
        lastName: data.lastName ?? undefined,
        fullName: data.fullName ?? undefined,
        role: data.role ?? undefined,
        propertyCount: data.propertyCount ?? undefined,
        unitCount: data.unitCount ?? undefined,
        phone: data.phone ?? undefined,
      },
    });

    // Fire-and-forget the operator notification. Errors must not bubble
    // up to the caller — the marketing form expects a 200 even if the
    // notification mailer is misconfigured.
    void this.notifyOps(entry).catch((err) => {
      this.logger.warn(
        `Waitlist notification failed for ${email}: ${err instanceof Error ? err.message : err}`,
      );
    });

    return entry;
  }

  /**
   * Email an internal recipient about a new waitlist signup. Recipient
   * comes from NOTIFICATIONS_EMAIL (defaults to info@mskguestbook.com).
   * EmailService itself no-ops with a loud log when SMTP_* is not set,
   * so this is safe to call regardless of deployment state.
   */
  private async notifyOps(entry: WaitlistEntry) {
    const to = this.config.get<string>('NOTIFICATIONS_EMAIL') ?? DEFAULT_NOTIFICATIONS_EMAIL;
    const fields: Array<[string, string | number | null | undefined]> = [
      ['Email', entry.email],
      ['First name', entry.firstName],
      ['Last name', entry.lastName],
      ['Role', entry.role],
      ['Property count', entry.propertyCount],
      ['Unit count', entry.unitCount],
      ['Phone', entry.phone],
      ['Source', entry.source],
      ['Entry ID', entry.id],
      ['Submitted at', entry.createdAt.toISOString()],
    ];
    const rows = fields
      .map(
        ([label, value]) =>
          `<tr><td style="padding:6px 12px 6px 0;color:#666;font-size:13px;vertical-align:top">${escapeHtml(label)}</td><td style="padding:6px 0;color:#222;font-size:13px;vertical-align:top">${escapeHtml(value ?? '—')}</td></tr>`,
      )
      .join('');
    const html = `
      <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px">
        <h2 style="font-size:18px;font-weight:600;margin:0 0 16px;color:#222">New waitlist signup</h2>
        <table style="border-collapse:collapse;width:100%">${rows}</table>
      </div>`;
    const subject = `[MSK waitlist] ${entry.email}`;
    await this.email.send(to, subject, html);
  }

  list(q?: string) {
    const where: Prisma.WaitlistEntryWhereInput | undefined = q
      ? {
          OR: [
            { email: { contains: q, mode: 'insensitive' } },
            { firstName: { contains: q, mode: 'insensitive' } },
            { lastName: { contains: q, mode: 'insensitive' } },
            { fullName: { contains: q, mode: 'insensitive' } },
            { propertyName: { contains: q, mode: 'insensitive' } },
          ],
        }
      : undefined;
    return this.prisma.waitlistEntry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  updateNotes(id: string, notes: string | null) {
    return this.prisma.waitlistEntry.update({
      where: { id },
      data: { notes: notes ?? null },
    });
  }

  remove(id: string) {
    return this.prisma.waitlistEntry.delete({ where: { id } });
  }
}

function escapeHtml(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
