import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';

import {
  CreateExpansionCityDto,
  ReorderItem,
  UpdateExpansionCityDto,
} from './dto/expansion-city.dto';

@Injectable()
export class ExpansionCitiesService {
  constructor(private readonly prisma: PrismaService) {}

  publicList() {
    return this.prisma.expansionCity.findMany({
      where: { isPublished: true },
      orderBy: { ordering: 'asc' },
    });
  }

  list() {
    return this.prisma.expansionCity.findMany({
      orderBy: { ordering: 'asc' },
    });
  }

  create(dto: CreateExpansionCityDto) {
    return this.prisma.expansionCity.create({
      data: {
        ...dto,
        expectedAt: dto.expectedAt ? new Date(dto.expectedAt) : null,
      },
    });
  }

  async update(id: string, dto: UpdateExpansionCityDto) {
    const existing = await this.prisma.expansionCity.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Expansion city not found');
    return this.prisma.expansionCity.update({
      where: { id },
      data: {
        ...dto,
        expectedAt: dto.expectedAt ? new Date(dto.expectedAt) : undefined,
      },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.expansionCity.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Expansion city not found');
    await this.prisma.expansionCity.delete({ where: { id } });
    return { deleted: true };
  }

  async reorder(items: ReorderItem[]) {
    await this.prisma.$transaction(
      items.map((i) =>
        this.prisma.expansionCity.update({
          where: { id: i.id },
          data: { ordering: i.ordering },
        }),
      ),
    );
    return { reordered: items.length };
  }
}
