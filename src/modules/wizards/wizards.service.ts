import { Injectable } from '@nestjs/common';
import { WizardKind } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class WizardsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Get or create the wizard state for a user + kind. */
  async getState(userId: string, kind: WizardKind) {
    const existing = await this.prisma.wizardState.findUnique({
      where: { userId_kind: { userId, kind } },
    });
    if (existing) return existing;
    return this.prisma.wizardState.create({ data: { userId, kind, step: 0 } });
  }

  /** Update the current step + accumulated data. */
  async update(userId: string, kind: WizardKind, dto: { step?: number; data?: any }) {
    return this.prisma.wizardState.upsert({
      where: { userId_kind: { userId, kind } },
      create: { userId, kind, step: dto.step ?? 0, data: dto.data },
      update: { step: dto.step, data: dto.data },
    });
  }

  /** Mark the wizard as completed. */
  async complete(userId: string, kind: WizardKind) {
    return this.prisma.wizardState.update({
      where: { userId_kind: { userId, kind } },
      data: { completedAt: new Date() },
    });
  }
}
