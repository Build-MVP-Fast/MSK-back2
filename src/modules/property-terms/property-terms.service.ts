import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateTermsDto, UpdateTermsDto } from './property-terms.dto';

@Injectable()
export class PropertyTermsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Published terms for a property — what the app shows at check-in. */
  listPublished(propertyId: string) {
    return this.prisma.propertyTerms.findMany({
      where: { propertyId, isPublished: true },
      orderBy: { ordering: 'asc' },
    });
  }

  /** All terms (draft + published) for the admin list. */
  list(propertyId: string) {
    return this.prisma.propertyTerms.findMany({
      where: { propertyId },
      orderBy: [{ ordering: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async detail(id: string) {
    const row = await this.prisma.propertyTerms.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Terms document not found');
    return row;
  }

  create(dto: CreateTermsDto, userId?: string) {
    return this.prisma.propertyTerms.create({
      data: {
        propertyId: dto.propertyId,
        title: dto.title ?? 'Terms & Conditions',
        body: dto.body ?? '',
        isPublished: dto.isPublished ?? false,
        ordering: dto.ordering ?? 0,
        updatedById: userId ?? null,
      },
    });
  }

  async update(id: string, dto: UpdateTermsDto, userId?: string) {
    await this.detail(id);
    return this.prisma.propertyTerms.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.body !== undefined && { body: dto.body }),
        ...(dto.isPublished !== undefined && { isPublished: dto.isPublished }),
        ...(dto.ordering !== undefined && { ordering: dto.ordering }),
        updatedById: userId ?? null,
      },
    });
  }

  async remove(id: string) {
    await this.detail(id);
    await this.prisma.propertyTerms.delete({ where: { id } });
    return { success: true };
  }
}
