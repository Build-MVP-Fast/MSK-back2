import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class AmenitiesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.amenity.findMany({ orderBy: { name: 'asc' } });
  }

  create(dto: Prisma.AmenityCreateInput) {
    return this.prisma.amenity.create({ data: dto });
  }

  update(id: string, dto: Prisma.AmenityUpdateInput) {
    return this.prisma.amenity.update({ where: { id }, data: dto });
  }

  remove(id: string) {
    return this.prisma.amenity.delete({ where: { id } });
  }

  attachToProperty(propertyId: string, amenityId: string, notes?: string) {
    return this.prisma.propertyAmenity.upsert({
      where: { propertyId_amenityId: { propertyId, amenityId } },
      create: { propertyId, amenityId, notes },
      update: { notes },
    });
  }

  detachFromProperty(propertyId: string, amenityId: string) {
    return this.prisma.propertyAmenity.delete({
      where: { propertyId_amenityId: { propertyId, amenityId } },
    });
  }

  attachToRoomType(roomTypeId: string, amenityId: string, notes?: string) {
    return this.prisma.roomAmenity.upsert({
      where: { roomTypeId_amenityId: { roomTypeId, amenityId } },
      create: { roomTypeId, amenityId, notes },
      update: { notes },
    });
  }

  detachFromRoomType(roomTypeId: string, amenityId: string) {
    return this.prisma.roomAmenity.delete({
      where: { roomTypeId_amenityId: { roomTypeId, amenityId } },
    });
  }
}
