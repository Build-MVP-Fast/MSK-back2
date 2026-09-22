import { Injectable } from "@nestjs/common";
import { AvailabilityBlockReason, RatePlanType } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  /* ── Seasonal rates (RatePlan type = SEASONAL / PROMOTIONAL / etc.) ── */

  listSeasonal(propertyId: string) {
    return this.prisma.ratePlan.findMany({
      where: { propertyId, type: { not: RatePlanType.CUSTOM } },
      orderBy: { startDate: "asc" },
    });
  }

  createSeasonal(dto: Record<string, unknown>) {
    return this.prisma.ratePlan.create({
      data: {
        propertyId: dto.propertyId as string,
        roomTypeId: (dto.roomTypeId as string) || null,
        name: (dto.name as string) ?? "Seasonal Rate",
        type: (dto.type as RatePlanType) ?? RatePlanType.STANDARD,
        description: (dto.description as string) || null,
        startDate: dto.startDate ? new Date(dto.startDate as string) : null,
        endDate: dto.endDate ? new Date(dto.endDate as string) : null,
        price: Number(dto.price ?? 0),
        currency: (dto.currency as string) ?? "GBP",
        minStay: dto.minStay ? Number(dto.minStay) : null,
        daysOfWeek: (dto.daysOfWeek as number[]) ?? [],
        isActive: dto.isActive !== false,
      },
    });
  }

  updateSeasonal(id: string, dto: Record<string, unknown>) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: Record<string, any> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.price !== undefined) data.price = Number(dto.price);
    if (dto.startDate !== undefined) data.startDate = dto.startDate ? new Date(dto.startDate as string) : null;
    if (dto.endDate !== undefined) data.endDate = dto.endDate ? new Date(dto.endDate as string) : null;
    if (dto.minStay !== undefined) data.minStay = dto.minStay ? Number(dto.minStay) : null;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.roomTypeId !== undefined) data.roomTypeId = dto.roomTypeId || null;
    if (dto.daysOfWeek !== undefined) data.daysOfWeek = dto.daysOfWeek;
    return this.prisma.ratePlan.update({ where: { id }, data });
  }

  deleteSeasonal(id: string) {
    return this.prisma.ratePlan.delete({ where: { id } });
  }

  /* ── Price overrides — single-date price override (type = CUSTOM) ── */

  listOverrides(propertyId: string) {
    return this.prisma.ratePlan.findMany({
      where: { propertyId, type: RatePlanType.CUSTOM },
      orderBy: { startDate: "asc" },
    });
  }

  createOverride(dto: Record<string, unknown>) {
    const date = dto.date ? new Date(dto.date as string) : null;
    return this.prisma.ratePlan.create({
      data: {
        propertyId: dto.propertyId as string,
        roomTypeId: (dto.roomTypeId as string) || null,
        name: `Override ${date ? date.toLocaleDateString("en-GB") : ""}`.trim(),
        type: RatePlanType.CUSTOM,
        startDate: date,
        endDate: date,
        price: Number(dto.price ?? 0),
        currency: (dto.currency as string) ?? "GBP",
        daysOfWeek: [],
      },
    });
  }

  deleteOverride(id: string) {
    return this.prisma.ratePlan.delete({ where: { id } });
  }

  /* ── Min-stay rules (RatePlan with minStay > 1) ── */

  listMinStay(propertyId: string) {
    return this.prisma.ratePlan.findMany({
      where: { propertyId, minStay: { gt: 1 } },
      orderBy: { startDate: "asc" },
    });
  }

  createMinStay(dto: Record<string, unknown>) {
    return this.prisma.ratePlan.create({
      data: {
        propertyId: dto.propertyId as string,
        roomTypeId: (dto.roomTypeId as string) || null,
        name: (dto.name as string) ?? `Min-stay ${dto.minNights ?? dto.minStay}n`,
        type: RatePlanType.LONG_STAY,
        startDate: dto.startDate ? new Date(dto.startDate as string) : null,
        endDate: dto.endDate ? new Date(dto.endDate as string) : null,
        price: Number(dto.price ?? 0),
        currency: (dto.currency as string) ?? "GBP",
        minStay: Number(dto.minNights ?? dto.minStay ?? 2),
        daysOfWeek: [],
      },
    });
  }

  deleteMinStay(id: string) {
    return this.prisma.ratePlan.delete({ where: { id } });
  }

  /* ── Availability blocks ── */

  listBlocks(propertyId: string) {
    return this.prisma.availabilityBlock.findMany({
      where: { propertyId },
      orderBy: { startDate: "asc" },
    });
  }

  createBlock(dto: Record<string, unknown>) {
    return this.prisma.availabilityBlock.create({
      data: {
        propertyId: dto.propertyId as string,
        roomId: (dto.roomId as string) || null,
        startDate: new Date(dto.startDate as string),
        endDate: new Date(dto.endDate as string),
        reason: (dto.reason as AvailabilityBlockReason) ?? AvailabilityBlockReason.MAINTENANCE,
        notes: (dto.notes as string) || null,
      },
    });
  }

  deleteBlock(id: string) {
    return this.prisma.availabilityBlock.delete({ where: { id } });
  }
}
