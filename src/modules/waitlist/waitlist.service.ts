import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';

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

@Injectable()
export class WaitlistService {
  constructor(private readonly prisma: PrismaService) {}

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

    return this.prisma.waitlistEntry.upsert({
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
