import { Injectable } from '@nestjs/common';
import { CostType, Prisma } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- Costs (staff/material/utility/etc.) -------------------------------

  listCosts(filter: { type?: CostType; companyId?: string; from?: Date; to?: Date } = {}) {
    return this.prisma.cost.findMany({
      where: {
        ...(filter.type && { type: filter.type }),
        ...(filter.companyId && { companyId: filter.companyId }),
        ...(filter.from || filter.to
          ? { occurredOn: { ...(filter.from && { gte: filter.from }), ...(filter.to && { lte: filter.to }) } }
          : {}),
      },
      orderBy: { occurredOn: 'desc' },
    });
  }

  createCost(dto: Prisma.CostUncheckedCreateInput) {
    return this.prisma.cost.create({ data: dto });
  }

  updateCost(id: string, dto: Prisma.CostUncheckedUpdateInput) {
    return this.prisma.cost.update({ where: { id }, data: dto });
  }

  removeCost(id: string) {
    return this.prisma.cost.delete({ where: { id } });
  }

  // ---- Revenue ------------------------------------------------------------

  listRevenue(filter: { companyId?: string; from?: Date; to?: Date } = {}) {
    return this.prisma.revenueEntry.findMany({
      where: {
        ...(filter.companyId && { companyId: filter.companyId }),
        ...(filter.from || filter.to
          ? { occurredOn: { ...(filter.from && { gte: filter.from }), ...(filter.to && { lte: filter.to }) } }
          : {}),
      },
      orderBy: { occurredOn: 'desc' },
    });
  }

  createRevenue(dto: Prisma.RevenueEntryUncheckedCreateInput) {
    return this.prisma.revenueEntry.create({ data: dto });
  }
}
