import { Injectable } from '@nestjs/common';
import { AccountKind, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async platformStats() {
    const [
      totalCompanies,
      activeCompanies,
      totalProperties,
      totalBookings,
      totalGuests,
      newCompaniesThisMonth,
    ] = await Promise.all([
      this.prisma.company.count(),
      this.prisma.company.count({ where: { status: 'ACTIVE' } }),
      this.prisma.property.count(),
      this.prisma.booking.count(),
      this.prisma.user.count({ where: { accountKind: AccountKind.APP } }),
      this.prisma.company.count({
        where: { createdAt: { gte: new Date(new Date().setDate(1)) } },
      }),
    ]);

    const mrr = await this.prisma.operatorSubscription
      .aggregate({ _sum: { amount: true }, where: { status: 'ACTIVE' } })
      .then(r => r._sum.amount ?? 0);

    return {
      totalOperators: totalCompanies,
      activeOperators: activeCompanies,
      totalProperties,
      totalBookings,
      totalGuests,
      newOperatorsThisMonth: newCompaniesThisMonth,
      mrr,
      arr: mrr * 12,
    };
  }

  operators() {
    return this.prisma.company.findMany({
      include: {
        _count: { select: { properties: true, users: true } },
        subscription: { select: { plan: true, status: true, amount: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  guests(skip = 0, take = 50) {
    return this.prisma.user.findMany({
      where: { accountKind: AccountKind.APP },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
  }

  properties() {
    return this.prisma.property.findMany({
      include: {
        company: { select: { id: true, name: true } },
        _count: { select: { rooms: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  subscriptions() {
    return this.prisma.operatorSubscription.findMany({
      include: { company: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateOperatorStatus(id: string, status: 'ACTIVE' | 'SUSPENDED' | 'INACTIVE') {
    return this.prisma.company.update({ where: { id }, data: { status: status as any } });
  }

  async upsertSubscription(companyId: string, dto: {
    plan?: string; status?: SubscriptionStatus; amount?: number; billingCycle?: string; nextBilling?: Date;
  }) {
    return this.prisma.operatorSubscription.upsert({
      where: { companyId },
      update: dto,
      create: { companyId, plan: dto.plan ?? 'Basic', status: dto.status ?? SubscriptionStatus.TRIAL, amount: dto.amount ?? 0, billingCycle: dto.billingCycle ?? 'monthly' },
    });
  }
}
