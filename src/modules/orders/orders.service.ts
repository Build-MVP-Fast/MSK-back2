import { Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { nanoid } from 'nanoid';

import { PrismaService } from '../../common/prisma/prisma.service';

function readMetadata(raw: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as Record<string, unknown>;
}

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  list(filter: { status?: OrderStatus } = {}) {
    return this.prisma.order.findMany({
      where: filter.status ? { status: filter.status } : undefined,
      include: { items: { include: { item: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async detail(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { items: { include: { item: true } } },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  create(dto: {
    supplierId?: string;
    createdById?: string;
    items: { itemId: string; quantity: number; unitPrice: number }[];
    currency?: string;
    notes?: string;
    expectedAt?: Date;
  }) {
    const items = dto.items.map((i) => ({
      itemId: i.itemId,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      total: i.quantity * i.unitPrice,
    }));
    const totalAmount = items.reduce((sum, i) => sum + Number(i.total), 0);
    return this.prisma.order.create({
      data: {
        number: `PO-${new Date().getFullYear()}-${nanoid(6).toUpperCase()}`,
        supplierId: dto.supplierId,
        createdById: dto.createdById,
        currency: dto.currency ?? 'USD',
        notes: dto.notes,
        expectedAt: dto.expectedAt,
        totalAmount,
        items: { create: items },
      },
      include: { items: true },
    });
  }

  setStatus(id: string, status: OrderStatus) {
    const data: any = { status };
    if (status === OrderStatus.RECEIVED) data.receivedAt = new Date();
    return this.prisma.order.update({ where: { id }, data });
  }

  /** Orders assigned to the supplier whose User.id matches `userId`.
   *  Resolves the SupplierProfile.id once and queries from there. */
  async listForSupplierUser(userId: string, status?: OrderStatus) {
    const profile = await this.prisma.supplierProfile.findUnique({
      where: { userId },
    });
    if (!profile) return [];
    return this.prisma.order.findMany({
      where: {
        supplierId: profile.id,
        ...(status && { status }),
      },
      include: { items: { include: { item: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Record carrier/tracking info into Order.metadata and bump status
   *  to IN_TRANSIT so the admin's order list reflects the dispatch. */
  async dispatch(
    id: string,
    info: { method?: string; trackingNumber?: string; carrier?: string; notes?: string },
  ) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Order not found');
    const meta = readMetadata(order.metadata);
    const dispatchedAt = new Date().toISOString();
    return this.prisma.order.update({
      where: { id },
      data: {
        status: OrderStatus.IN_TRANSIT,
        metadata: {
          ...meta,
          dispatch: { ...info, dispatchedAt },
        } as unknown as Prisma.InputJsonValue,
      },
    });
  }
}
