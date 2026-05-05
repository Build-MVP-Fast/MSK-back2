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
