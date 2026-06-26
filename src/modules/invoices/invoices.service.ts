import { Injectable, NotFoundException } from '@nestjs/common';
import { InvoiceStatus, Prisma } from '@prisma/client';
import { nanoid } from 'nanoid';

import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(opts: { userId?: string; operatorCompanyId?: string } = {}) {
    // Backfill legacy supplier invoices that have metadata.orderId but
    // no metadata.operatorCompanyId (created before the tenant-scope
    // change shipped). Without this, every pre-change invoice is
    // invisible to its rightful operator. Resolve via the linked
    // order's createdBy.companyId and stamp it on the invoice.
    if (opts.operatorCompanyId) {
      // Pull every invoice whose metadata mentions an orderId, then
      // in-memory filter to those missing operatorCompanyId. Cheap on
      // realistic dataset sizes; the Prisma JSON-path NULL filter is
      // finicky enough that going through JS once is safer.
      const candidates = await this.prisma.invoice.findMany({
        where: { metadata: { path: ['orderId'], not: Prisma.DbNull } },
        select: { id: true, metadata: true },
      });
      for (const inv of candidates) {
        const meta = (inv.metadata && typeof inv.metadata === 'object' && !Array.isArray(inv.metadata)
          ? (inv.metadata as Record<string, unknown>)
          : {});
        if (typeof meta.operatorCompanyId === 'string' && meta.operatorCompanyId.length > 0) continue;
        const orderId = typeof meta.orderId === 'string' ? meta.orderId : null;
        if (!orderId) continue;
        const order = await this.prisma.order.findUnique({
          where: { id: orderId },
          select: { createdBy: { select: { companyId: true } } },
        });
        const buyerCompanyId = order?.createdBy?.companyId ?? null;
        if (!buyerCompanyId) continue;
        await this.prisma.invoice.update({
          where: { id: inv.id },
          data: {
            metadata: { ...meta, operatorCompanyId: buyerCompanyId } as Prisma.InputJsonValue,
          },
        });
      }
    }

    const where: Prisma.InvoiceWhereInput = {};
    if (opts.userId) where.booking = { guestUserId: opts.userId };
    // Tenant scope for operator-side listing: only invoices whose
    // metadata.operatorCompanyId matches the caller's company. Set
    // at create-time by the supplier flow + backfilled above.
    if (opts.operatorCompanyId) {
      where.metadata = {
        path: ['operatorCompanyId'],
        equals: opts.operatorCompanyId,
      };
    }
    return this.prisma.invoice.findMany({
      where,
      include: { items: true, booking: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async detail(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { items: true, booking: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  async setStatus(id: string, status: 'PAID' | 'VOIDED' | 'ISSUED') {
    return this.prisma.invoice.update({
      where: { id },
      data: { status },
    });
  }

  create(dto: {
    bookingId?: string;
    issuedById?: string;
    recipientName?: string;
    recipientEmail?: string;
    recipientAddress?: string;
    items: { description: string; quantity: number; unitPrice: number; taxRate?: number }[];
    currency?: string;
    notes?: string;
  }) {
    const items = dto.items.map((i) => ({
      description: i.description,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      taxRate: i.taxRate ?? 0,
      total: i.quantity * i.unitPrice * (1 + (i.taxRate ?? 0) / 100),
    }));
    const subtotal = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
    const taxAmount = items.reduce(
      (sum, i) => sum + i.quantity * i.unitPrice * (i.taxRate ?? 0) / 100,
      0,
    );
    const total = subtotal + taxAmount;
    return this.prisma.invoice.create({
      data: {
        number: `INV-${new Date().getFullYear()}-${nanoid(6).toUpperCase()}`,
        bookingId: dto.bookingId,
        issuedById: dto.issuedById,
        recipientName: dto.recipientName,
        recipientEmail: dto.recipientEmail,
        recipientAddress: dto.recipientAddress,
        status: InvoiceStatus.ISSUED,
        subtotal,
        taxAmount,
        total,
        currency: dto.currency ?? 'USD',
        issuedAt: new Date(),
        notes: dto.notes,
        items: { create: items },
      },
      include: { items: true },
    });
  }

  /**
   * Guest-initiated request from the mobile InvoiceRequest screen. The
   * guest picks one of three scopes — "under my name", "under a
   * company", "under someone else" — and submits the recipient
   * details. We create a DRAFT invoice attached to their current
   * booking with the booking's outstanding total as a single line
   * item; the accounts team finalises (lines + tax + issued status)
   * from the admin side. Status is DRAFT so it doesn't appear as an
   * issued invoice yet.
   */
  async request(input: {
    userId: string;
    bookingId: string;
    recipientName?: string;
    recipientEmail?: string;
    notes?: string;
    /** Pulled from the booking so we don't have to trust the client. */
    amount: number;
    currency: string;
  }) {
    return this.prisma.invoice.create({
      data: {
        number: `REQ-${new Date().getFullYear()}-${nanoid(6).toUpperCase()}`,
        bookingId: input.bookingId,
        issuedById: input.userId,
        recipientName: input.recipientName,
        recipientEmail: input.recipientEmail,
        status: InvoiceStatus.DRAFT,
        subtotal: input.amount,
        taxAmount: 0,
        total: input.amount,
        currency: input.currency,
        notes: input.notes,
      },
    });
  }

  /** Marks invoice as paid (or partially paid) — typically called after payment webhook. */
  markPaid(id: string, fully = true) {
    return this.prisma.invoice.update({
      where: { id },
      data: {
        status: fully ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID,
        paidAt: fully ? new Date() : undefined,
      },
    });
  }

  void(id: string) {
    return this.prisma.invoice.update({ where: { id }, data: { status: InvoiceStatus.VOIDED } });
  }

  /** Invoices the given user issued (used by supplier "my invoices"). */
  listByIssuer(userId: string) {
    return this.prisma.invoice.findMany({
      where: { issuedById: userId },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Supplier raises an invoice (typically against a delivered Order).
   *  We stamp it ISSUED right away — the admin accounts team can
   *  approve / pay / void it from the admin side. The optional
   *  `orderId` is stored on metadata for cross-reference. */
  async createSupplierInvoice(
    issuedById: string,
    input: {
      recipientName?: string;
      recipientEmail?: string;
      recipientAddress?: string;
      items: { description: string; quantity: number; unitPrice: number }[];
      currency?: string;
      notes?: string;
      orderId?: string;
    },
  ) {
    if (!input.items || input.items.length === 0) {
      throw new NotFoundException('At least one line item is required.');
    }
    const items = input.items.map((i) => ({
      description: i.description,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      taxRate: 0,
      total: i.quantity * i.unitPrice,
    }));
    const subtotal = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);

    // Resolve the buyer-side companyId from the linked order so the
    // operator-side inbox can filter to invoices for orders THEIR
    // company placed. Without this, every Property Operator would
    // see every supplier invoice on the entire platform.
    let operatorCompanyId: string | null = null;
    if (input.orderId) {
      const order = await this.prisma.order.findUnique({
        where: { id: input.orderId },
        select: { createdBy: { select: { companyId: true } } },
      });
      operatorCompanyId = order?.createdBy?.companyId ?? null;
    }

    return this.prisma.invoice.create({
      data: {
        number: `INV-${new Date().getFullYear()}-${nanoid(6).toUpperCase()}`,
        issuedById,
        recipientName: input.recipientName,
        recipientEmail: input.recipientEmail,
        recipientAddress: input.recipientAddress,
        status: InvoiceStatus.ISSUED,
        subtotal,
        taxAmount: 0,
        total: subtotal,
        currency: input.currency ?? 'USD',
        issuedAt: new Date(),
        notes: input.notes,
        ...(input.orderId && {
          metadata: {
            orderId: input.orderId,
            ...(operatorCompanyId && { operatorCompanyId }),
          } as unknown as Prisma.InputJsonValue,
        }),
        items: { create: items },
      },
      include: { items: true },
    });
  }
}
