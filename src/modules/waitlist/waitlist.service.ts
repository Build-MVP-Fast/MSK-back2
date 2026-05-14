import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';

export interface CreateWaitlistInput {
  email: string;
  fullName?: string | null;
  role?: string | null;
  propertyName?: string | null;
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
   */
  async signup(input: CreateWaitlistInput) {
    const email = input.email.trim().toLowerCase();
    const data = {
      email,
      fullName: input.fullName?.trim() || null,
      role: input.role?.trim() || null,
      propertyName: input.propertyName?.trim() || null,
      phone: input.phone?.trim() || null,
      source: input.source?.trim() || null,
    };
    return this.prisma.waitlistEntry.upsert({
      where: { email },
      create: data,
      update: {
        // Preserve original source; only update mutable details.
        fullName: data.fullName ?? undefined,
        role: data.role ?? undefined,
        propertyName: data.propertyName ?? undefined,
        phone: data.phone ?? undefined,
      },
    });
  }

  list(q?: string) {
    const where: Prisma.WaitlistEntryWhereInput | undefined = q
      ? {
          OR: [
            { email: { contains: q, mode: 'insensitive' } },
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
