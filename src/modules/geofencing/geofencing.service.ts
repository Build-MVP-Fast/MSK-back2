import { Injectable } from '@nestjs/common';
import { GeofenceEventType, Prisma } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class GeofencingService {
  constructor(private readonly prisma: PrismaService) {}

  list(propertyId?: string) {
    return this.prisma.geofence.findMany({
      where: propertyId ? { propertyId } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }

  detail(id: string) {
    return this.prisma.geofence.findUnique({
      where: { id },
      include: { events: { orderBy: { occurredAt: 'desc' }, take: 50 } },
    });
  }

  create(dto: Prisma.GeofenceUncheckedCreateInput) {
    return this.prisma.geofence.create({ data: dto });
  }

  update(id: string, dto: Prisma.GeofenceUncheckedUpdateInput) {
    return this.prisma.geofence.update({ where: { id }, data: dto });
  }

  remove(id: string) {
    return this.prisma.geofence.delete({ where: { id } });
  }

  /** Record a geofence event (enter/exit/dwell). Called by mobile clients. */
  recordEvent(dto: {
    geofenceId: string;
    userId: string;
    type: GeofenceEventType;
    latitude?: number;
    longitude?: number;
  }) {
    return this.prisma.geofenceEvent.create({ data: dto });
  }

  events(geofenceId: string) {
    return this.prisma.geofenceEvent.findMany({
      where: { geofenceId },
      include: { user: true },
      orderBy: { occurredAt: 'desc' },
      take: 100,
    });
  }
}
