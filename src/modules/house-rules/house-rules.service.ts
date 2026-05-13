import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';

import { CreateHouseRuleDto, ReorderItem, UpdateHouseRuleDto } from './dto/house-rule.dto';

@Injectable()
export class HouseRulesService {
  constructor(private readonly prisma: PrismaService) {}

  publicList() {
    return this.prisma.houseRule.findMany({
      where: { isPublished: true },
      orderBy: [{ category: 'asc' }, { ordering: 'asc' }],
    });
  }

  list() {
    return this.prisma.houseRule.findMany({
      orderBy: [{ category: 'asc' }, { ordering: 'asc' }],
    });
  }

  create(dto: CreateHouseRuleDto) {
    return this.prisma.houseRule.create({ data: dto });
  }

  async update(id: string, dto: UpdateHouseRuleDto) {
    const existing = await this.prisma.houseRule.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('House rule not found');
    return this.prisma.houseRule.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    const existing = await this.prisma.houseRule.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('House rule not found');
    await this.prisma.houseRule.delete({ where: { id } });
    return { deleted: true };
  }

  async reorder(items: ReorderItem[]) {
    await this.prisma.$transaction(
      items.map((i) =>
        this.prisma.houseRule.update({ where: { id: i.id }, data: { ordering: i.ordering } }),
      ),
    );
    return { reordered: items.length };
  }
}
