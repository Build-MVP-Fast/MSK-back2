import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class RoomTypesService {
  constructor(private readonly prisma: PrismaService) {}

  publicList(propertyId: string) {
    return this.prisma.roomType.findMany({
      where: { propertyId },
      include: {
        photos: { orderBy: { ordering: 'asc' } },
        amenities: { include: { amenity: true } },
      },
      orderBy: { ordering: 'asc' },
    });
  }

  list(propertyId?: string) {
    return this.prisma.roomType.findMany({
      where: propertyId ? { propertyId } : undefined,
      include: { photos: true, amenities: { include: { amenity: true } }, rooms: true },
      orderBy: { ordering: 'asc' },
    });
  }

  async detail(id: string) {
    const rt = await this.prisma.roomType.findUnique({
      where: { id },
      include: {
        photos: true,
        amenities: { include: { amenity: true } },
        rooms: true,
        ratePlans: true,
      },
    });
    if (!rt) throw new NotFoundException('Room type not found');
    return rt;
  }

  create(dto: Prisma.RoomTypeUncheckedCreateInput) {
    return this.prisma.roomType.create({ data: dto });
  }

  update(id: string, dto: Prisma.RoomTypeUncheckedUpdateInput) {
    return this.prisma.roomType.update({ where: { id }, data: dto });
  }

  remove(id: string) {
    return this.prisma.roomType.delete({ where: { id } });
  }
}
