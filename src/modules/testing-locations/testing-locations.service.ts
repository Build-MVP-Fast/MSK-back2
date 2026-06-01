import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';

import {
  CreateTestingLocationDto,
  UpdateTestingLocationDto,
} from './dto/testing-location.dto';

@Injectable()
export class TestingLocationsService {
  constructor(private readonly prisma: PrismaService) {}

  publicList() {
    return this.prisma.testingLocation.findMany({
      where: { isPublished: true },
      orderBy: { ordering: 'asc' },
    });
  }

  list() {
    return this.prisma.testingLocation.findMany({
      orderBy: { ordering: 'asc' },
    });
  }

  create(dto: CreateTestingLocationDto) {
    return this.prisma.testingLocation.create({ data: dto });
  }

  async update(id: string, dto: UpdateTestingLocationDto) {
    const existing = await this.prisma.testingLocation.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Testing location not found');
    return this.prisma.testingLocation.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    const existing = await this.prisma.testingLocation.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Testing location not found');
    await this.prisma.testingLocation.delete({ where: { id } });
    return { deleted: true };
  }
}
