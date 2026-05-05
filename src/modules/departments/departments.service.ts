import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class DepartmentsService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId?: string) {
    return this.prisma.department.findMany({
      where: companyId ? { companyId } : undefined,
      include: { children: true, parent: true },
      orderBy: { name: 'asc' },
    });
  }

  async detail(id: string) {
    const dept = await this.prisma.department.findUnique({
      where: { id },
      include: {
        members: { include: { user: true } },
        children: true,
        parent: true,
      },
    });
    if (!dept) throw new NotFoundException('Department not found');
    return dept;
  }

  create(dto: Prisma.DepartmentUncheckedCreateInput) {
    return this.prisma.department.create({ data: dto });
  }

  update(id: string, dto: Prisma.DepartmentUncheckedUpdateInput) {
    return this.prisma.department.update({ where: { id }, data: dto });
  }

  remove(id: string) {
    return this.prisma.department.delete({ where: { id } });
  }

  addMember(departmentId: string, userId: string, positionTitle?: string, isHead = false) {
    return this.prisma.departmentMember.upsert({
      where: { departmentId_userId: { departmentId, userId } },
      create: { departmentId, userId, positionTitle, isHead },
      update: { positionTitle, isHead },
    });
  }

  removeMember(departmentId: string, userId: string) {
    return this.prisma.departmentMember.delete({
      where: { departmentId_userId: { departmentId, userId } },
    });
  }
}
