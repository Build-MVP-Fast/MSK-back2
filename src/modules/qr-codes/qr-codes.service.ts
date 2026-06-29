import { Injectable, NotFoundException } from '@nestjs/common';
import { QrCodeTarget } from '@prisma/client';
import { nanoid } from 'nanoid';
import * as QRCode from 'qrcode';

import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class QrCodesService {
  constructor(private readonly prisma: PrismaService) {}

  /** List QR codes, scoped to the caller's company (tenant isolation). */
  list(filter: { companyId?: string | null; propertyId?: string; target?: QrCodeTarget } = {}) {
    return this.prisma.qrCode.findMany({
      where: {
        ...(filter.companyId && { companyId: filter.companyId }),
        ...(filter.propertyId && { propertyId: filter.propertyId }),
        ...(filter.target && { target: filter.target }),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Generate a QR code with a unique short code, plus a base64 PNG image.
   * Stamps the owning company so it shows only in that operator's list.
   */
  async generate(dto: {
    target: QrCodeTarget;
    companyId?: string | null;
    propertyId?: string;
    roomId?: string;
    payload?: any;
  }) {
    const code = nanoid(10);
    const dataUrl = await QRCode.toDataURL(code, { margin: 1, width: 512 });
    const record = await this.prisma.qrCode.create({
      data: {
        code,
        target: dto.target,
        companyId: dto.companyId ?? undefined,
        propertyId: dto.propertyId,
        roomId: dto.roomId,
        payload: dto.payload,
      },
    });
    return { ...record, dataUrl };
  }

  /**
   * Get-or-create the calling user's personal STAFF QR code (so a guest can
   * scan it to leave a review about that staff member). Idempotent — one per
   * user, matched by payload.staffId. Returns the record + a fresh PNG.
   */
  async getOrCreateMyStaffQr(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, fullName: true, firstName: true, lastName: true, companyId: true },
    });
    if (!user) throw new NotFoundException('User not found');
    const staffName =
      user.fullName?.trim() ||
      [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
      'Staff';

    let record = await this.prisma.qrCode.findFirst({
      where: { target: QrCodeTarget.STAFF, payload: { path: ['staffId'], equals: userId } },
    });
    if (!record) {
      record = await this.prisma.qrCode.create({
        data: {
          code: nanoid(10),
          target: QrCodeTarget.STAFF,
          companyId: user.companyId ?? undefined,
          payload: { staffId: userId, staffName },
        },
      });
    }
    const dataUrl = await QRCode.toDataURL(record.code, { margin: 1, width: 512 });
    return { ...record, dataUrl };
  }

  async resolve(code: string) {
    const record = await this.prisma.qrCode.findUnique({
      where: { code },
      include: { property: true, room: true },
    });
    if (!record) throw new NotFoundException('Unknown QR code');
    return record;
  }

  recordScan(code: string, userId?: string, context?: any) {
    return this.prisma.qrCode.update({
      where: { code },
      data: {
        scans: { create: { userId, context } },
      },
    });
  }

  deactivate(id: string) {
    return this.prisma.qrCode.update({ where: { id }, data: { isActive: false } });
  }
}
