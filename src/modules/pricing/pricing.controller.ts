/**
 * /pricing  — unified pricing & availability endpoint used by the Operator Portal.
 *
 * Endpoints:
 *   GET  /pricing/seasonal?propertyId=          List seasonal rate plans
 *   POST /pricing/seasonal                       Create a seasonal rate plan
 *   PATCH /pricing/seasonal/:id                 Update
 *   DELETE /pricing/seasonal/:id                Delete
 *
 *   GET  /pricing/overrides?propertyId=          List per-date price overrides (RatePlan type=OVERRIDE)
 *   POST /pricing/overrides                       Create an override
 *   DELETE /pricing/overrides/:id                Delete
 *
 *   GET  /pricing/min-stay?propertyId=           List min-stay rules (RatePlan with minStay > 0)
 *   POST /pricing/min-stay                        Create
 *   DELETE /pricing/min-stay/:id                 Delete
 *
 *   GET  /pricing/blocks?propertyId=             List availability blocks
 *   POST /pricing/blocks                          Create
 *   DELETE /pricing/blocks/:id                   Delete
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";

import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { PricingService } from "./pricing.service";

@ApiTags("pricing")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_USER)
@Controller("pricing")
export class PricingController {
  constructor(private readonly svc: PricingService) {}

  /* ── Seasonal rates ─────────────────────────────────────────────── */

  @Get("seasonal")
  listSeasonal(@Query("propertyId") propertyId: string) {
    return this.svc.listSeasonal(propertyId);
  }

  @Post("seasonal")
  createSeasonal(@Body() dto: Record<string, unknown>) {
    return this.svc.createSeasonal(dto);
  }

  @Patch("seasonal/:id")
  updateSeasonal(@Param("id") id: string, @Body() dto: Record<string, unknown>) {
    return this.svc.updateSeasonal(id, dto);
  }

  @Delete("seasonal/:id")
  deleteSeasonal(@Param("id") id: string) {
    return this.svc.deleteSeasonal(id);
  }

  /* ── Price overrides ────────────────────────────────────────────── */

  @Get("overrides")
  listOverrides(@Query("propertyId") propertyId: string) {
    return this.svc.listOverrides(propertyId);
  }

  @Post("overrides")
  createOverride(@Body() dto: Record<string, unknown>) {
    return this.svc.createOverride(dto);
  }

  @Delete("overrides/:id")
  deleteOverride(@Param("id") id: string) {
    return this.svc.deleteOverride(id);
  }

  /* ── Minimum-stay rules ─────────────────────────────────────────── */

  @Get("min-stay")
  listMinStay(@Query("propertyId") propertyId: string) {
    return this.svc.listMinStay(propertyId);
  }

  @Post("min-stay")
  createMinStay(@Body() dto: Record<string, unknown>) {
    return this.svc.createMinStay(dto);
  }

  @Delete("min-stay/:id")
  deleteMinStay(@Param("id") id: string) {
    return this.svc.deleteMinStay(id);
  }

  /* ── Availability blocks ────────────────────────────────────────── */

  @Get("blocks")
  listBlocks(@Query("propertyId") propertyId: string) {
    return this.svc.listBlocks(propertyId);
  }

  @Post("blocks")
  createBlock(@Body() dto: Record<string, unknown>) {
    return this.svc.createBlock(dto);
  }

  @Delete("blocks/:id")
  deleteBlock(@Param("id") id: string) {
    return this.svc.deleteBlock(id);
  }
}
