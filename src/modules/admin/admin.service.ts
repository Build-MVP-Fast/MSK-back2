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
    plan?: string; status?: SubscriptionStatus; amount?: number; billingCycle?: string; nextBilling?: Date; enabledModules?: string[];
  }) {
    return this.prisma.operatorSubscription.upsert({
      where: { companyId },
      update: dto,
      create: { companyId, plan: dto.plan ?? 'Basic', status: dto.status ?? SubscriptionStatus.TRIAL, amount: dto.amount ?? 0, billingCycle: dto.billingCycle ?? 'monthly', enabledModules: dto.enabledModules ?? [] },
    });
  }

  async updateSubscriptionModules(companyId: string, enabledModules: string[]) {
    return this.prisma.operatorSubscription.upsert({
      where: { companyId },
      update: { enabledModules },
      create: { companyId, enabledModules, plan: 'Basic', status: SubscriptionStatus.TRIAL, amount: 0, billingCycle: 'monthly' },
    });
  }

  // Platform invites
  createInvite(dto: { email: string; role?: string; accessPages?: string[] }) {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    return this.prisma.platformInvite.create({
      data: { email: dto.email, role: dto.role ?? 'ADMIN', accessPages: dto.accessPages ?? [], expiresAt },
    });
  }

  listInvites() {
    return this.prisma.platformInvite.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async deleteInvite(id: string) {
    return this.prisma.platformInvite.delete({ where: { id } });
  }

  async deleteOperator(id: string) {
    return this.prisma.company.delete({ where: { id } });
  }

  async deleteGuest(id: string) {
    return this.prisma.user.delete({ where: { id } });
  }

  /**
   * Send a platform message to an operator.
   * Creates a support ticket on their behalf so it appears in the support queue.
   */
  async messageOperator(companyId: string, message: string) {
    // Find the primary admin user for this company
    const admin = await this.prisma.user.findFirst({
      where: { companyId, role: 'ADMIN' },
      select: { id: true, email: true },
    });
    return this.prisma.supportTicket.create({
      data: {
        subject: 'Message from Super Admin',
        body: message,
        fromEmail: admin?.email ?? 'superadmin@mskguestbook.com',
        status: 'OPEN',
        companyId,
      },
    });
  }
}
