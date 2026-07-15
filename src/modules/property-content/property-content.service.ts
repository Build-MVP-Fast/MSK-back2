import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';

import { UpsertPropertyContentDto } from './dto/upsert-property-content.dto';

@Injectable()
export class PropertyContentService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Public read (consumed by the website) ─────────────────────────────
  /** All published property content, ordered for stable display. */
  publicAll() {
    return this.prisma.propertyContent.findMany({
      where: { isPublished: true },
      orderBy: { ordering: 'asc' },
    });
  }

  // ── Admin reads ───────────────────────────────────────────────────────
  listAll() {
    return this.prisma.propertyContent.findMany({ orderBy: { ordering: 'asc' } });
  }

  getBySlug(slug: string) {
    return this.prisma.propertyContent.findUnique({ where: { slug } });
  }

  // ── Admin write (upsert by slug) ──────────────────────────────────────
  upsert(slug: string, dto: UpsertPropertyContentDto, userId?: string) {
    const data = {
      name: dto.name ?? '',
      location: dto.location ?? '',
      tagline: dto.tagline ?? '',
      description: dto.description ?? '',
      heroImage: dto.heroImage ?? '',
      images: (dto.images ?? []) as unknown as Prisma.InputJsonValue,
      rooms: (dto.rooms ?? {}) as unknown as Prisma.InputJsonValue,
      ordering: dto.ordering ?? 0,
      isPublished: dto.isPublished ?? true,
      updatedById: userId ?? null,
    };
    return this.prisma.propertyContent.upsert({
      where: { slug },
      create: { slug, ...data },
      update: data,
    });
  }
}
