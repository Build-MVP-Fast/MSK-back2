import { Injectable, NotFoundException } from '@nestjs/common';
import { InvoiceStatus, Prisma } from '@prisma/client';
import { nanoid } from 'nanoid';

import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId?: string) {
    return this.prisma.invoice.findMany({
      where: userId ? { booking: { guestUserId: userId } } : undefined,
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
}
