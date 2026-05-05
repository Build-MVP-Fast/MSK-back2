import { Injectable, NotFoundException } from '@nestjs/common';
import { QrCodeTarget } from '@prisma/client';
import { nanoid } from 'nanoid';
import * as QRCode from 'qrcode';

import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class QrCodesService {
  constructor(private readonly prisma: PrismaService) {}

  list(filter: { propertyId?: string; target?: QrCodeTarget } = {}) {
    return this.prisma.qrCode.findMany({
      where: {
        ...(filter.propertyId && { propertyId: filter.propertyId }),
        ...(filter.target && { target: filter.target }),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Generate a QR code with a unique short code, plus a base64 PNG image.
   * The image can be uploaded to storage by callers if persistence is required.
   */
  async generate(dto: {
    target: QrCodeTarget;
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
        propertyId: dto.propertyId,
        roomId: dto.roomId,
        payload: dto.payload,
      },
    });
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
