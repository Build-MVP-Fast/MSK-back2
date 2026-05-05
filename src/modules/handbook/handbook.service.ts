import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class HandbookService {
  constructor(private readonly prisma: PrismaService) {}

  listCategories(propertyId?: string) {
    return this.prisma.handbookCategory.findMany({
      where: propertyId ? { propertyId } : undefined,
      include: { items: { where: { isPublished: true }, orderBy: { ordering: 'asc' } } },
      orderBy: { ordering: 'asc' },
    });
  }

  itemDetail(id: string) {
    return this.prisma.handbookItem.findUnique({ where: { id }, include: { category: true } });
  }

  createCategory(dto: Prisma.HandbookCategoryUncheckedCreateInput) {
    return this.prisma.handbookCategory.create({ data: dto });
  }

  updateCategory(id: string, dto: Prisma.HandbookCategoryUncheckedUpdateInput) {
    return this.prisma.handbookCategory.update({ where: { id }, data: dto });
  }

  removeCategory(id: string) {
    return this.prisma.handbookCategory.delete({ where: { id } });
  }

  createItem(dto: Prisma.HandbookItemUncheckedCreateInput) {
    return this.prisma.handbookItem.create({ data: dto });
  }

  updateItem(id: string, dto: Prisma.HandbookItemUncheckedUpdateInput) {
    return this.prisma.handbookItem.update({ where: { id }, data: dto });
  }

  removeItem(id: string) {
    return this.prisma.handbookItem.delete({ where: { id } });
  }
}
