import { Injectable } from '@nestjs/common';
import { PropertyStatus } from '@prisma/client';
import dayjs from 'dayjs';

import { PrismaService } from '../../common/prisma/prisma.service';

interface SearchInput {
  q?: string;
  city?: string;
  country?: string;
  checkIn?: Date;
  checkOut?: Date;
  adults?: number;
  children?: number;
  amenities?: string[];
  minPrice?: number;
  maxPrice?: number;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class PublicService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Public-facing search across published properties. Supports text query,
   * city/country filters, amenity filters, price range, and date-aware
   * availability filtering when checkIn/checkOut are provided.
   */
  async search(input: SearchInput) {
    const page = input.page ?? 1;
    const pageSize = Math.min(input.pageSize ?? 20, 100);

    const properties = await this.prisma.property.findMany({
      where: {
        status: PropertyStatus.PUBLISHED,
        ...(input.q && {
          OR: [
            { name: { contains: input.q, mode: 'insensitive' } },
            { description: { contains: input.q, mode: 'insensitive' } },
            { city: { contains: input.q, mode: 'insensitive' } },
          ],
        }),
        ...(input.city && { city: { contains: input.city, mode: 'insensitive' } }),
        ...(input.country && { country: { equals: input.country, mode: 'insensitive' } }),
        ...(input.amenities?.length && {
          amenities: { some: { amenity: { key: { in: input.amenities } } } },
        }),
      },
      include: {
        photos: { where: { isCover: true }, take: 1 },
        amenities: { include: { amenity: true } },
        roomTypes: { select: { basePrice: true, currency: true, name: true } },
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    });

    // If date range provided, filter out properties with no availability
    let filtered = properties;
    if (input.checkIn && input.checkOut) {
      const days = dayjs(input.checkOut).diff(dayjs(input.checkIn), 'day');
      filtered = await Promise.all(
        properties.map(async (p) => {
          const blocks = await this.prisma.availabilityBlock.count({
            where: {
              propertyId: p.id,
              startDate: { lte: input.checkOut },
              endDate: { gte: input.checkIn },
            },
          });
          return { property: p, blocks, days };
        }),
      ).then((arr) => arr.filter((x) => x.blocks < (x.property.roomTypes.length || 1)).map((x) => x.property));
    }

    return { data: filtered, meta: { page, pageSize, count: filtered.length } };
  }

  /** Featured / homepage properties. */
  featured() {
    return this.prisma.property.findMany({
      where: { status: PropertyStatus.PUBLISHED },
      take: 6,
      include: { photos: { where: { isCover: true }, take: 1 } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** All distinct cities for filter dropdowns. */
  async distinctCities() {
    const rows = await this.prisma.property.findMany({
      where: { status: PropertyStatus.PUBLISHED, city: { not: null } },
      select: { city: true, country: true },
      distinct: ['city'],
    });
    return rows;
  }
}
