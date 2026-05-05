import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.company.findMany({ orderBy: { name: 'asc' } });
  }

  async detail(id: string) {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: { departments: true, properties: true },
    });
    if (!company) throw new NotFoundException('Company not found');
    return company;
  }

  create(dto: Prisma.CompanyCreateInput) {
    return this.prisma.company.create({ data: dto });
  }

  update(id: string, dto: Prisma.CompanyUpdateInput) {
    return this.prisma.company.update({ where: { id }, data: dto });
  }

  remove(id: string) {
    return this.prisma.company.delete({ where: { id } });
  }
}
