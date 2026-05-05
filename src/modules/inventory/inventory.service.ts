import { Injectable } from '@nestjs/common';
import { InventoryMovementType, Prisma } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  listItems(filter: { propertyId?: string; companyId?: string } = {}) {
    return this.prisma.inventoryItem.findMany({
      where: {
        ...(filter.propertyId && { propertyId: filter.propertyId }),
        ...(filter.companyId && { companyId: filter.companyId }),
      },
      orderBy: { name: 'asc' },
    });
  }

  itemDetail(id: string) {
    return this.prisma.inventoryItem.findUnique({
      where: { id },
      include: {
        movements: { orderBy: { createdAt: 'desc' }, take: 50 },
        allocations: { where: { returnedAt: null } },
      },
    });
  }

  createItem(dto: Prisma.InventoryItemUncheckedCreateInput) {
    return this.prisma.inventoryItem.create({ data: dto });
  }

  updateItem(id: string, dto: Prisma.InventoryItemUncheckedUpdateInput) {
    return this.prisma.inventoryItem.update({ where: { id }, data: dto });
  }

  removeItem(id: string) {
    return this.prisma.inventoryItem.delete({ where: { id } });
  }

  recordMovement(dto: {
    itemId: string;
    type: InventoryMovementType;
    quantity: number;
    fromLocation?: string;
    toLocation?: string;
    reference?: string;
    notes?: string;
  }) {
    return this.prisma.inventoryMovement.create({ data: dto });
  }

  allocate(dto: {
    itemId: string;
    roomId?: string;
    allocatedToUserId?: string;
    quantity: number;
    notes?: string;
  }) {
    return this.prisma.inventoryAllocation.create({ data: dto });
  }

  returnAllocation(id: string) {
    return this.prisma.inventoryAllocation.update({
      where: { id },
      data: { returnedAt: new Date() },
    });
  }

  listAllocations(filter: { roomId?: string; userId?: string } = {}) {
    return this.prisma.inventoryAllocation.findMany({
      where: {
        ...(filter.roomId && { roomId: filter.roomId }),
        ...(filter.userId && { allocatedToUserId: filter.userId }),
        returnedAt: null,
      },
      include: { item: true, room: true, allocatedToUser: true },
    });
  }
}
