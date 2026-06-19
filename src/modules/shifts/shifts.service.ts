import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';

export interface CreateShiftInput {
  title: string;
  startTime: string;
  endTime: string;
  daysOfWeek?: string;
  notes?: string;
  companyId?: string;
}

export interface UpdateShiftInput {
  title?: string;
  startTime?: string;
  endTime?: string;
  daysOfWeek?: string | null;
  notes?: string | null;
}

@Injectable()
export class ShiftsService {
  constructor(private readonly prisma: PrismaService) {}

  /** All shift templates, optionally scoped to a company. */
  list(companyId?: string) {
    const where: Prisma.ShiftWhereInput = companyId ? { companyId } : {};
    return this.prisma.shift.findMany({
      where,
      orderBy: [{ startTime: 'asc' }, { title: 'asc' }],
    });
  }

  async detail(id: string) {
    const shift = await this.prisma.shift.findUnique({ where: { id } });
    if (!shift) throw new NotFoundException('Shift not found');
    return shift;
  }

  create(input: CreateShiftInput) {
    return this.prisma.shift.create({
      data: {
        title: input.title,
        startTime: input.startTime,
        endTime: input.endTime,
        daysOfWeek: input.daysOfWeek,
        notes: input.notes,
        companyId: input.companyId,
      },
    });
  }

  async update(id: string, input: UpdateShiftInput) {
    await this.detail(id); // ensure exists
    return this.prisma.shift.update({
      where: { id },
      data: input,
    });
  }

  async remove(id: string) {
    await this.detail(id);
    await this.prisma.shift.delete({ where: { id } });
    return { ok: true };
  }
}
