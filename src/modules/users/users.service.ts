import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  list(filter: { role?: UserRole; companyId?: string; q?: string } = {}) {
    return this.prisma.user.findMany({
      where: {
        ...(filter.role && { role: filter.role }),
        ...(filter.companyId && { companyId: filter.companyId }),
        ...(filter.q && {
          OR: [
            { email: { contains: filter.q, mode: 'insensitive' } },
            { fullName: { contains: filter.q, mode: 'insensitive' } },
            { phone: { contains: filter.q } },
          ],
        }),
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async detail(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        guestProfile: { include: { additionalGuests: true } },
        staffProfile: true,
        supplierProfile: true,
        company: true,
        departments: { include: { department: true } },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  update(id: string, dto: Prisma.UserUncheckedUpdateInput) {
    return this.prisma.user.update({ where: { id }, data: dto });
  }

  /** Soft-delete (sets deletedAt + isActive=false). */
  async deactivate(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
    });
  }

  // ---- Additional guests on a guest profile ------------------------------
  addAdditionalGuest(guestProfileId: string, dto: Prisma.AdditionalGuestUncheckedCreateInput) {
    return this.prisma.additionalGuest.create({ data: { ...dto, hostProfileId: guestProfileId } });
  }

  removeAdditionalGuest(id: string) {
    return this.prisma.additionalGuest.delete({ where: { id } });
  }
}
