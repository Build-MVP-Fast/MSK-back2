import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class AdsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Public — only return active ads that are within their schedule */
  listPublic() {
    const now = new Date();
    return this.prisma.ad.findMany({
      where: {
        isActive: true,
        OR: [{ startDate: null }, { startDate: { lte: now } }],
        AND: [{ OR: [{ endDate: null }, { endDate: { gte: now } }] }],
      },
      orderBy: { order: 'asc' },
    });
  }

  /** Admin — return all ads regardless of active/schedule */
  listAll() {
    return this.prisma.ad.findMany({ orderBy: { order: 'asc' } });
  }

  async get(id: string) {
    const ad = await this.prisma.ad.findUnique({ where: { id } });
    if (!ad) throw new NotFoundException('Ad not found');
    return ad;
  }

  create(dto: {
    title: string;
    imageUrl: string;
    linkUrl?: string;
    description?: string;
    isActive?: boolean;
    order?: number;
    startDate?: Date;
    endDate?: Date;
  }) {
    return this.prisma.ad.create({ data: dto });
  }

  async update(id: string, dto: Partial<{
    title: string;
    imageUrl: string;
    linkUrl: string | null;
    description: string | null;
    isActive: boolean;
    order: number;
    startDate: Date | null;
    endDate: Date | null;
  }>) {
    await this.get(id);
    return this.prisma.ad.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.get(id);
    return this.prisma.ad.delete({ where: { id } });
  }

  async reorder(ids: string[]) {
    await Promise.all(
      ids.map((id, index) => this.prisma.ad.update({ where: { id }, data: { order: index } })),
    );
    return this.listAll();
  }
}
