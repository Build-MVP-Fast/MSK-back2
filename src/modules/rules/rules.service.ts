import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class RulesService {
  constructor(private readonly prisma: PrismaService) {}

  list(propertyId?: string) {
    return this.prisma.ruleSection.findMany({
      where: propertyId ? { propertyId } : undefined,
      include: { items: { orderBy: { ordering: 'asc' } } },
      orderBy: { ordering: 'asc' },
    });
  }

  createSection(dto: Prisma.RuleSectionUncheckedCreateInput) {
    return this.prisma.ruleSection.create({ data: dto });
  }

  updateSection(id: string, dto: Prisma.RuleSectionUncheckedUpdateInput) {
    return this.prisma.ruleSection.update({ where: { id }, data: dto });
  }

  removeSection(id: string) {
    return this.prisma.ruleSection.delete({ where: { id } });
  }

  createItem(dto: Prisma.RuleItemUncheckedCreateInput) {
    return this.prisma.ruleItem.create({ data: dto });
  }

  updateItem(id: string, dto: Prisma.RuleItemUncheckedUpdateInput) {
    return this.prisma.ruleItem.update({ where: { id }, data: dto });
  }

  removeItem(id: string) {
    return this.prisma.ruleItem.delete({ where: { id } });
  }
}
