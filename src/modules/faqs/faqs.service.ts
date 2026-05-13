import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';

import { CreateFaqDto, ReorderItem, UpdateFaqDto } from './dto/faq.dto';

@Injectable()
export class FaqsService {
  constructor(private readonly prisma: PrismaService) {}

  publicList() {
    return this.prisma.faq.findMany({
      where: { isPublished: true },
      orderBy: [{ category: 'asc' }, { ordering: 'asc' }],
    });
  }

  list() {
    return this.prisma.faq.findMany({
      orderBy: [{ category: 'asc' }, { ordering: 'asc' }],
    });
  }

  create(dto: CreateFaqDto) {
    return this.prisma.faq.create({ data: dto });
  }

  async update(id: string, dto: UpdateFaqDto) {
    const existing = await this.prisma.faq.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('FAQ not found');
    return this.prisma.faq.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    const existing = await this.prisma.faq.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('FAQ not found');
    await this.prisma.faq.delete({ where: { id } });
    return { deleted: true };
  }

  async reorder(items: ReorderItem[]) {
    await this.prisma.$transaction(
      items.map((i) =>
        this.prisma.faq.update({ where: { id: i.id }, data: { ordering: i.ordering } }),
      ),
    );
    return { reordered: items.length };
  }
}
