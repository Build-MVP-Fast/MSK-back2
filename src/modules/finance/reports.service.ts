import { Injectable } from '@nestjs/common';
import { CostType } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';

interface RangeFilter {
  companyId?: string;
  from?: Date;
  to?: Date;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /** P&L summary — revenue minus all costs in range. */
  async profitAndLoss(filter: RangeFilter) {
    const where = {
      ...(filter.companyId && { companyId: filter.companyId }),
      ...(filter.from || filter.to
        ? { occurredOn: { ...(filter.from && { gte: filter.from }), ...(filter.to && { lte: filter.to }) } }
        : {}),
    };

    const [revenueAgg, costAgg, costsByType] = await Promise.all([
      this.prisma.revenueEntry.aggregate({ where, _sum: { amount: true } }),
      this.prisma.cost.aggregate({ where, _sum: { amount: true } }),
      this.prisma.cost.groupBy({
        by: ['type'],
        where,
        _sum: { amount: true },
      }),
    ]);

    const revenue = Number(revenueAgg._sum.amount ?? 0);
    const costs = Number(costAgg._sum.amount ?? 0);

    return {
      revenue,
      costs,
      profit: revenue - costs,
      breakdown: Object.fromEntries(
        costsByType.map((c) => [c.type, Number(c._sum.amount ?? 0)]),
      ),
    };
  }

  /** Revenue by month for charts. */
  async revenueByMonth(filter: RangeFilter) {
    const entries = await this.prisma.revenueEntry.findMany({
      where: {
        ...(filter.companyId && { companyId: filter.companyId }),
        ...(filter.from || filter.to
          ? { occurredOn: { ...(filter.from && { gte: filter.from }), ...(filter.to && { lte: filter.to }) } }
          : {}),
      },
      select: { amount: true, occurredOn: true },
    });
    const map = new Map<string, number>();
    for (const e of entries) {
      const key = `${e.occurredOn.getFullYear()}-${String(e.occurredOn.getMonth() + 1).padStart(2, '0')}`;
      map.set(key, (map.get(key) ?? 0) + Number(e.amount));
    }
    return Array.from(map.entries()).map(([month, total]) => ({ month, total }));
  }

  /** Staff cost summary — sum of CostType.STAFF in range. */
  staffCost(filter: RangeFilter) {
    return this.prisma.cost.aggregate({
      where: {
        type: CostType.STAFF,
        ...(filter.companyId && { companyId: filter.companyId }),
        ...(filter.from || filter.to
          ? { occurredOn: { ...(filter.from && { gte: filter.from }), ...(filter.to && { lte: filter.to }) } }
          : {}),
      },
      _sum: { amount: true },
    });
  }

  materialCost(filter: RangeFilter) {
    return this.prisma.cost.aggregate({
      where: {
        type: CostType.MATERIAL,
        ...(filter.companyId && { companyId: filter.companyId }),
        ...(filter.from || filter.to
          ? { occurredOn: { ...(filter.from && { gte: filter.from }), ...(filter.to && { lte: filter.to }) } }
          : {}),
      },
      _sum: { amount: true },
    });
  }

  /** Booking-derived metrics: occupancy rate, ADR, RevPAR. */
  async bookingMetrics(filter: { propertyId?: string; from: Date; to: Date }) {
    const bookings = await this.prisma.booking.findMany({
      where: {
        ...(filter.propertyId && { propertyId: filter.propertyId }),
        checkIn: { gte: filter.from, lte: filter.to },
        status: { in: ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'] },
      },
    });
    const totalRoomNights = bookings.reduce((s, b) => s + b.nights, 0);
    const totalRevenue = bookings.reduce((s, b) => s + Number(b.totalAmount), 0);
    const adr = totalRoomNights > 0 ? totalRevenue / totalRoomNights : 0;
    return { bookings: bookings.length, totalRoomNights, totalRevenue, adr };
  }
}
