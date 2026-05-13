import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';

import {
  CreateTestimonialDto,
  ReorderItem,
  UpdateTestimonialDto,
} from './dto/testimonial.dto';

@Injectable()
export class TestimonialsService {
  constructor(private readonly prisma: PrismaService) {}

  publicList() {
    return this.prisma.testimonial.findMany({
      where: { isPublished: true },
      orderBy: { ordering: 'asc' },
    });
  }

  list() {
    return this.prisma.testimonial.findMany({
      orderBy: { ordering: 'asc' },
    });
  }

  create(dto: CreateTestimonialDto) {
    return this.prisma.testimonial.create({ data: dto });
  }

  async update(id: string, dto: UpdateTestimonialDto) {
    const existing = await this.prisma.testimonial.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Testimonial not found');
    return this.prisma.testimonial.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    const existing = await this.prisma.testimonial.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Testimonial not found');
    await this.prisma.testimonial.delete({ where: { id } });
    return { deleted: true };
  }

  async reorder(items: ReorderItem[]) {
    await this.prisma.$transaction(
      items.map((i) =>
        this.prisma.testimonial.update({
          where: { id: i.id },
          data: { ordering: i.ordering },
        }),
      ),
    );
    return { reordered: items.length };
  }
}
