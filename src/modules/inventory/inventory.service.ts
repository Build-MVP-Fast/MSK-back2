import { Injectable } from '@nestjs/common';
import { InventoryMovementType, Prisma } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';

/** Mobile reads `quantityOnHand` and `storageLocation` on each item,
 *  but the InventoryItem schema only tracks quantity via Movement
 *  records and has no dedicated storageLocation column. We stash the
 *  location on metadata.storageLocation and compute quantity on read. */
type EnrichedItem = Prisma.InventoryItemGetPayload<Record<string, never>> & {
  quantityOnHand: number;
  storageLocation: string | null;
};

function readStorageFromMeta(metadata: Prisma.JsonValue | null): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const v = (metadata as Record<string, unknown>).storageLocation;
  return typeof v === 'string' ? v : null;
}

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async listItems(filter: { propertyId?: string; companyId?: string } = {}): Promise<EnrichedItem[]> {
    const items = await this.prisma.inventoryItem.findMany({
      where: {
        ...(filter.propertyId && { propertyId: filter.propertyId }),
        ...(filter.companyId && { companyId: filter.companyId }),
      },
      orderBy: { name: 'asc' },
    });
    if (items.length === 0) return [];
    const groups = await this.prisma.inventoryMovement.groupBy({
      by: ['itemId', 'type'],
      where: { itemId: { in: items.map((i) => i.id) } },
      _sum: { quantity: true },
    });
    const onHandByItem = new Map<string, number>();
    for (const g of groups) {
      const sum = Number(g._sum.quantity ?? 0);
      const signed = g.type === InventoryMovementType.OUT || g.type === InventoryMovementType.ALLOCATION ? -sum : sum;
      onHandByItem.set(g.itemId, (onHandByItem.get(g.itemId) ?? 0) + signed);
    }
    return items.map((i) => ({
      ...i,
      quantityOnHand: Math.max(0, onHandByItem.get(i.id) ?? 0),
      storageLocation: readStorageFromMeta(i.metadata),
    }));
  }

  async itemDetail(id: string): Promise<EnrichedItem | null> {
    const item = await this.prisma.inventoryItem.findUnique({
      where: { id },
      include: {
        movements: { orderBy: { createdAt: 'desc' }, take: 50 },
        allocations: { where: { returnedAt: null } },
      },
    });
    if (!item) return null;
    const groups = await this.prisma.inventoryMovement.groupBy({
      by: ['type'],
      where: { itemId: id },
      _sum: { quantity: true },
    });
    let onHand = 0;
    for (const g of groups) {
      const sum = Number(g._sum.quantity ?? 0);
      onHand += g.type === InventoryMovementType.OUT || g.type === InventoryMovementType.ALLOCATION ? -sum : sum;
    }
    return {
      ...item,
      quantityOnHand: Math.max(0, onHand),
      storageLocation: readStorageFromMeta(item.metadata),
    };
  }

  async createItem(
    dto: Partial<Prisma.InventoryItemUncheckedCreateInput> & {
      quantityOnHand?: number | string;
      storageLocation?: string | null;
    },
    callerCompanyId?: string,
  ): Promise<EnrichedItem> {
    // Strip all non-column fields the operator UI sends:
    //   quantity / minStock / locationId come from the web frontend
    //   quantityOnHand / storageLocation from the mobile app
    // Treat `quantity` as the initial stock quantity if `quantityOnHand` is absent.
    // Map `minStock` → `reorderLevel` (actual column name).
    const {
      quantityOnHand: _qoh,
      storageLocation,
      metadata,
      name,
      quantity,         // web frontend field — used as initial stock
      minStock,         // web frontend field — maps to reorderLevel
      locationId,       // web frontend field — stored in metadata
      ...rest
    } = dto as typeof dto & { quantity?: number; minStock?: number; locationId?: string };
    const quantityOnHand = _qoh ?? quantity;
    const initialQty = Math.max(0, Number(quantityOnHand ?? 0) || 0);
    const meta = (metadata && typeof metadata === 'object' && !Array.isArray(metadata))
      ? (metadata as Record<string, unknown>)
      : {};
    if (storageLocation) meta.storageLocation = storageLocation;

    if (locationId) meta.storageLocation = locationId;

    const item = await this.prisma.inventoryItem.create({
      data: {
        ...rest,
        name: name ?? 'New item',
        ...(minStock !== undefined ? { reorderLevel: Number(minStock) } : {}),
        ...(callerCompanyId ? { companyId: callerCompanyId } : {}),
        ...(Object.keys(meta).length ? { metadata: meta as Prisma.InputJsonValue } : {}),
      },
    });
    if (initialQty > 0) {
      await this.prisma.inventoryMovement.create({
        data: {
          itemId: item.id,
          type: InventoryMovementType.IN,
          quantity: initialQty,
          notes: 'Initial stock',
        },
      });
    }
    return {
      ...item,
      quantityOnHand: initialQty,
      storageLocation: readStorageFromMeta(item.metadata),
    };
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
