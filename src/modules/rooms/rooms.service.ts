import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
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

  async create(dto: Prisma.RoomUncheckedCreateInput) {
    try {
      return await this.prisma.room.create({ data: dto });
    } catch (err) {
      throw mapRoomError(err, dto.number as string | undefined);
    }
  }

  async update(id: string, dto: Prisma.RoomUncheckedUpdateInput) {
    try {
      return await this.prisma.room.update({ where: { id }, data: dto });
    } catch (err) {
      throw mapRoomError(err, dto.number as string | undefined);
    }
  }

  remove(id: string) {
    return this.prisma.room.delete({ where: { id } });
  }
}

/**
 * Translates Prisma errors into HTTP responses the admin UI can render
 * directly. The interesting case is the unique-(propertyId, number)
 * constraint: a raw P2002 surfaces as "Internal server error" via the
 * default exception filter, which tells the user nothing — admins need
 * to see "Room 101 already exists in this property" so they can pick a
 * different number.
 */
function mapRoomError(err: unknown, number?: string): unknown {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    const hint = number
      ? `Room "${number}" already exists in this property.`
      : 'A room with that number already exists in this property.';
    return new ConflictException(hint);
  }
  return err;
}
