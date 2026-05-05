import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class RoomsService {
  constructor(private readonly prisma: PrismaService) {}

  list(propertyId?: string, roomTypeId?: string) {
    const where: Prisma.RoomWhereInput = {
      ...(propertyId && { propertyId }),
      ...(roomTypeId && { roomTypeId }),
    };
    return this.prisma.room.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      include: { roomType: true, photos: true },
      orderBy: { number: 'asc' },
    });
  }

  async detail(id: string) {
    const room = await this.prisma.room.findUnique({
      where: { id },
      include: { roomType: true, photos: true, qrCodes: true },
    });
    if (!room) throw new NotFoundException('Room not found');
    return room;
  }

  create(dto: Prisma.RoomUncheckedCreateInput) {
    return this.prisma.room.create({ data: dto });
  }

  update(id: string, dto: Prisma.RoomUncheckedUpdateInput) {
    return this.prisma.room.update({ where: { id }, data: dto });
  }

  remove(id: string) {
    return this.prisma.room.delete({ where: { id } });
  }
}
