import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';
import {
  CreateHandbookDocumentDto,
  UpdateHandbookDocumentDto,
} from './handbook-documents.dto';

@Injectable()
export class HandbookDocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Published documents for a property — the app's downloadable handbook. */
  listPublished(propertyId: string) {
    return this.prisma.handbookDocument.findMany({
      where: { propertyId, isPublished: true },
      orderBy: { ordering: 'asc' },
    });
  }

  /** All documents (published + hidden) for the admin table. */
  list(propertyId: string) {
    return this.prisma.handbookDocument.findMany({
      where: { propertyId },
      orderBy: [{ ordering: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async detail(id: string) {
    const row = await this.prisma.handbookDocument.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Document not found');
    return row;
  }

  create(dto: CreateHandbookDocumentDto, userId?: string) {
    return this.prisma.handbookDocument.create({
      data: {
        propertyId: dto.propertyId,
        name: dto.name,
        fileUrl: dto.fileUrl,
        fileType: dto.fileType ?? 'PDF',
        fileSize: dto.fileSize ?? null,
        ordering: dto.ordering ?? 0,
        isPublished: dto.isPublished ?? true,
        updatedById: userId ?? null,
      },
    });
  }

  async update(id: string, dto: UpdateHandbookDocumentDto, userId?: string) {
    await this.detail(id);
    return this.prisma.handbookDocument.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.fileUrl !== undefined && { fileUrl: dto.fileUrl }),
        ...(dto.fileType !== undefined && { fileType: dto.fileType }),
        ...(dto.fileSize !== undefined && { fileSize: dto.fileSize }),
        ...(dto.ordering !== undefined && { ordering: dto.ordering }),
        ...(dto.isPublished !== undefined && { isPublished: dto.isPublished }),
        updatedById: userId ?? null,
      },
    });
  }

  async remove(id: string) {
    await this.detail(id);
    await this.prisma.handbookDocument.delete({ where: { id } });
    return { success: true };
  }
}
