import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationChannel, OrderStatus, Prisma, UserRole } from '@prisma/client';
import { nanoid } from 'nanoid';

import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

function readMetadata(raw: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as Record<string, unknown>;
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private notify(userId: string | null | undefined, title: string, body: string, orderId: string) {
    if (!userId) return;
    void this.notifications.send({
      userId,
      channel: NotificationChannel.PUSH,
      title,
      body,
      data: { orderId, kind: 'order' },
    });
  }

  private async resolveSupplierUserId(supplierProfileId: string | null | undefined): Promise<string | null> {
    if (!supplierProfileId) return null;
    const profile = await this.prisma.supplierProfile.findUnique({
      where: { id: supplierProfileId },
      select: { userId: true },
    });
    return profile?.userId ?? null;
  }

  list(filter: { status?: OrderStatus; companyId?: string } = {}) {
    return this.prisma.order.findMany({
      where: {
        ...(filter.status && { status: filter.status }),
        ...(filter.companyId && { createdBy: { companyId: filter.companyId } }),
      },
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

  async create(dto: {
    supplierId?: string;
    /** Convenience: when the admin only knows the supplier's login
     *  email, resolve it server-side to the SupplierProfile.id. */
    supplierEmail?: string;
    createdById?: string;
    items: { itemId: string; quantity: number; unitPrice: number }[];
    currency?: string;
    notes?: string;
    expectedAt?: Date;
  }) {
    let supplierId = dto.supplierId;
    if (!supplierId && dto.supplierEmail) {
      const trimmed = dto.supplierEmail.trim();
      // Match on email + role=SUPPLIER (multi-role identity: one email
      // can hold both a supplier and a non-supplier account; we only
      // want the supplier one). supplierProfile is the relation we
      // need the id of for the Order.supplierId FK.
      const supplierUser = await this.prisma.user.findFirst({
        where: { email: trimmed, role: UserRole.SUPPLIER },
        include: { supplierProfile: true },
      });
      if (!supplierUser?.supplierProfile) {
        throw new NotFoundException(
          `No supplier is registered with the email "${trimmed}". Ask them to sign up first.`,
        );
      }
      supplierId = supplierUser.supplierProfile.id;
    }
    const items = dto.items.map((i) => ({
      itemId: i.itemId,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      total: i.quantity * i.unitPrice,
    }));
    const totalAmount = items.reduce((sum, i) => sum + Number(i.total), 0);
    const order = await this.prisma.order.create({
      data: {
        number: `PO-${new Date().getFullYear()}-${nanoid(6).toUpperCase()}`,
        supplierId,
        createdById: dto.createdById,
        currency: dto.currency ?? 'USD',
        notes: dto.notes,
        expectedAt: dto.expectedAt,
        totalAmount,
        items: { create: items },
      },
      include: { items: true },
    });
    const supplierUserId = await this.resolveSupplierUserId(supplierId);
    this.notify(supplierUserId, 'New purchase order', `Order ${order.number}`, order.id);
    return order;
  }

  async setStatus(id: string, status: OrderStatus) {
    const data: any = { status };
    if (status === OrderStatus.RECEIVED) data.receivedAt = new Date();
    const order = await this.prisma.order.update({ where: { id }, data });
    this.notify(order.createdById, `Order ${status.toLowerCase()}`, `Order ${order.number}`, order.id);
    return order;
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
    const updated = await this.prisma.order.update({
      where: { id },
      data: {
        status: OrderStatus.IN_TRANSIT,
        metadata: {
          ...meta,
          dispatch: { ...info, dispatchedAt },
        } as unknown as Prisma.InputJsonValue,
      },
    });
    this.notify(updated.createdById, 'Order dispatched', `Order ${updated.number}`, updated.id);
    return updated;
  }
}
