import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PropertyStatus } from '@prisma/client';
type JsonInput = Prisma.InputJsonValue;

import { PrismaService } from '../../common/prisma/prisma.service';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { CreatePropertyDto, PropertyFilterDto, UpdatePropertyDto } from './dto';

@Injectable()
export class PropertiesService {
  constructor(private readonly prisma: PrismaService) {}

  async publicList(filter: PropertyFilterDto, pagination: PaginationDto) {
    const page = pagination.page ?? 1;
    const pageSize = pagination.pageSize ?? 20;
    const where: Prisma.PropertyWhereInput = {
      status: PropertyStatus.PUBLISHED,
      ...(filter.city && { city: { contains: filter.city, mode: 'insensitive' } }),
      ...(filter.country && { country: { equals: filter.country, mode: 'insensitive' } }),
      ...(filter.q && {
        OR: [
          { name: { contains: filter.q, mode: 'insensitive' } },
          { description: { contains: filter.q, mode: 'insensitive' } },
          { city: { contains: filter.q, mode: 'insensitive' } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.property.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          photos: { where: { isCover: true }, take: 1 },
          amenities: { include: { amenity: true } },
          roomTypes: {
            select: { id: true, name: true, basePrice: true, currency: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.property.count({ where }),
    ]);

    return { data: items, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  }

  publicDetail(slug: string) {
    return this.prisma.property
      .findFirst({
        where: { slug, status: PropertyStatus.PUBLISHED },
        include: {
          photos: { orderBy: { ordering: 'asc' } },
          amenities: { include: { amenity: true } },
          roomTypes: {
            include: {
              photos: { orderBy: { ordering: 'asc' } },
              amenities: { include: { amenity: true } },
            },
          },
          rules: { include: { items: { orderBy: { ordering: 'asc' } } } },
          reviews: { where: { isPublic: true, isApproved: true }, take: 10 },
        },
      })
      .then((p) => {
        if (!p) throw new NotFoundException('Property not found');
        return p;
      });
  }

  async list(query: PaginationDto & { status?: PropertyStatus; companyId?: string }) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.PropertyWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.companyId ? { companyId: query.companyId } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.property.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.property.count({ where }),
    ]);
    return { data: items, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  }

  async detail(id: string) {
    const property = await this.prisma.property.findUnique({
      where: { id },
      include: {
        photos: { orderBy: { ordering: 'asc' } },
        amenities: { include: { amenity: true } },
        roomTypes: {
          include: {
            rooms: true,
            photos: { orderBy: { ordering: 'asc' } },
          },
        },
      },
    });
    if (!property) throw new NotFoundException('Property not found');
    return property;
  }

  create(dto: CreatePropertyDto & { companyId: string }) {
    const { metadata, ...rest } = dto;
    return this.prisma.property.create({
      data: {
        ...rest,
        slug: rest.slug ?? slugify(rest.name),
        ...(metadata !== undefined ? { metadata: metadata as JsonInput } : {}),
      },
    });
  }

  update(id: string, dto: UpdatePropertyDto) {
    const { metadata, ...rest } = dto;
    return this.prisma.property.update({
      where: { id },
      data: {
        ...rest,
        ...(metadata !== undefined ? { metadata: metadata as JsonInput } : {}),
      },
    });
  }

  publish(id: string) {
    return this.prisma.property.update({
      where: { id },
      data: { status: PropertyStatus.PUBLISHED, publishedAt: new Date() },
    });
  }

  archive(id: string) {
    return this.prisma.property.update({
      where: { id },
      data: { status: PropertyStatus.ARCHIVED, archivedAt: new Date() },
    });
  }

  async remove(id: string, callerCompanyId?: string) {
    if (callerCompanyId) {
      const existing = await this.prisma.property.findUnique({
        where: { id },
        select: { companyId: true },
      });
      if (!existing) throw new NotFoundException('Property not found');
      if (existing.companyId !== callerCompanyId) {
        throw new ForbiddenException("You can't delete a property from another company.");
      }
    }
    return this.prisma.property.delete({ where: { id } });
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
