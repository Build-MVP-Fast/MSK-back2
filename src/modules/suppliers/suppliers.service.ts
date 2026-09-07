import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string) {
    return this.prisma.supplier.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(id: string, companyId: string) {
    const s = await this.prisma.supplier.findFirst({ where: { id, companyId } });
    if (!s) throw new NotFoundException('Supplier not found');
    return s;
  }

  create(companyId: string, dto: any) {
    return this.prisma.supplier.create({ data: { ...dto, companyId } });
  }

  async update(id: string, companyId: string, dto: any) {
    await this.get(id, companyId);
    return this.prisma.supplier.update({ where: { id }, data: dto });
  }

  async remove(id: string, companyId: string) {
    await this.get(id, companyId);
    return this.prisma.supplier.delete({ where: { id } });
  }
}
