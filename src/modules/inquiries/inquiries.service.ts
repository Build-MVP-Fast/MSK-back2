import { Injectable } from '@nestjs/common';
import { InquiryStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class InquiriesService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- Newsletter ---------------------------------------------------------
  subscribeNewsletter(dto: { email: string; userId?: string; source?: string }) {
    return this.prisma.newsletterSubscription.upsert({
      where: { email: dto.email },
      create: dto,
      update: { isActive: true, unsubscribedAt: null },
    });
  }

  unsubscribeNewsletter(email: string) {
    return this.prisma.newsletterSubscription.update({
      where: { email },
      data: { isActive: false, unsubscribedAt: new Date() },
    });
  }

  listNewsletter() {
    return this.prisma.newsletterSubscription.findMany({ orderBy: { createdAt: 'desc' } });
  }

  // ---- Partner inquiries (about page modal) ------------------------------
  createPartnerInquiry(dto: Prisma.PartnerInquiryUncheckedCreateInput) {
    return this.prisma.partnerInquiry.create({ data: dto });
  }

  listPartnerInquiries(status?: InquiryStatus) {
    return this.prisma.partnerInquiry.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }

  setPartnerStatus(id: string, status: InquiryStatus, notes?: string) {
    return this.prisma.partnerInquiry.update({ where: { id }, data: { status, notes } });
  }

  // ---- Contact inquiries -------------------------------------------------
  createContactInquiry(dto: Prisma.ContactInquiryUncheckedCreateInput) {
    return this.prisma.contactInquiry.create({ data: dto });
  }

  listContactInquiries(status?: InquiryStatus) {
    return this.prisma.contactInquiry.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }

  setContactStatus(id: string, status: InquiryStatus, notes?: string) {
    return this.prisma.contactInquiry.update({ where: { id }, data: { status, notes } });
  }
}
