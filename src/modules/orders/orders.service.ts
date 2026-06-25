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

  /** Cheap ownership check used by the supplier-scoped detail route.
   *  Returns true when the supplier whose User.id matches the caller
   *  is the supplier the order is bound to. */
  async isOrderForSupplierUser(orderId: string, userId: string): Promise<boolean> {
    const profile = await this.prisma.supplierProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!profile) return false;
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { supplierId: true },
    });
    return order?.supplierId === profile.id;
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
    const trimmedEmail = dto.supplierEmail?.trim().toLowerCase();
    if (!supplierId && trimmedEmail) {
      // Match on email + role=SUPPLIER. Auto-create the SupplierProfile
      // if the user exists as SUPPLIER but the profile row is missing
      // (legacy data or interrupted wizard run). Bind the order to it.
      const supplierUser = await this.prisma.user.findFirst({
        where: { email: trimmedEmail, role: UserRole.SUPPLIER },
        include: { supplierProfile: true },
      });
      if (supplierUser) {
        if (supplierUser.supplierProfile) {
          supplierId = supplierUser.supplierProfile.id;
        } else {
          const profile = await this.prisma.supplierProfile.create({
            data: {
              userId: supplierUser.id,
              companyName: supplierUser.fullName?.trim() || trimmedEmail,
            },
          });
          supplierId = profile.id;
        }
      }
      // If no SUPPLIER user with that email exists yet, DON'T throw.
      // The order is still created (the operator might have placed it
      // before the supplier signed up); the next time that supplier
      // logs in, listForSupplierUser claims any orphaned orders that
      // were tagged with their email via metadata.supplierEmail.
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
        // The mobile Create Request flow always sends — there is no
        // "save as draft" UI — so default to SUBMITTED. The Prisma
        // schema default of DRAFT was leaving every new order in a
        // limbo state where the supplier dashboard's "New Orders"
        // counter (which looks for SUBMITTED) read zero.
        status: OrderStatus.SUBMITTED,
        // Stamp the supplier's email on the order so a supplier who
        // signs up AFTER the order was placed (or whose profile was
        // mid-create when the order came in) can still claim it on
        // their first dashboard load via listForSupplierUser.
        ...(trimmedEmail && {
          metadata: { supplierEmail: trimmedEmail } as Prisma.InputJsonValue,
        }),
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
   *  Resolves the SupplierProfile.id once and queries from there.
   *
   *  Self-heal: if the caller is a SUPPLIER user with no profile row
   *  (legacy data, incomplete wizard run, or any other reason the
   *  profile didn't get created at registration), we create the row
   *  on the fly using their fullName/email as companyName. Then we
   *  ALSO look for orders that were created against that email
   *  before the profile existed (those have supplierId = null but
   *  metadata.supplierEmail = the address) and bind them in. This is
   *  what unblocks "I created an order for fapic34088@... and the
   *  supplier doesn't see it" without us having to surgically delete
   *  and recreate users on the live DB. */
  async listForSupplierUser(userId: string, status?: OrderStatus) {
    let profile = await this.prisma.supplierProfile.findUnique({
      where: { userId },
    });
    if (!profile) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, fullName: true, role: true },
      });
      if (!user || user.role !== UserRole.SUPPLIER) return [];
      profile = await this.prisma.supplierProfile.create({
        data: {
          userId: user.id,
          companyName: user.fullName?.trim() || user.email || 'Supplier',
        },
      });
    }
    // Backfill: bind any pre-existing orders that targeted this
    // supplier's email but never resolved to a supplierId because
    // the original create call happened before the email→profile
    // lookup shipped (commit 506b9ed). One-shot per supplier load.
    const userEmail = (
      await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      })
    )?.email?.toLowerCase();
    if (userEmail) {
      const orphans = await this.prisma.order.findMany({
        where: {
          supplierId: null,
          metadata: { path: ['supplierEmail'], equals: userEmail },
        },
        select: { id: true },
      });
      if (orphans.length > 0) {
        await this.prisma.order.updateMany({
          where: { id: { in: orphans.map((o) => o.id) } },
          data: { supplierId: profile.id },
        });
      }
    }
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
