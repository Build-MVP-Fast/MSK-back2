import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";

import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";

import { MewsSyncService } from "./mews-sync.service";

@ApiTags("mews-sync")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_USER)
@Controller("mews-sync")
export class MewsSyncController {
  constructor(private readonly service: MewsSyncService) {}

  /** Manually trigger a mirror — all Mews-backed properties, or one. */
  @Post("run")
  run(@Body() body: { propertyId?: string }) {
    return body?.propertyId
      ? this.service.syncProperty(body.propertyId)
      : this.service.syncAll();
  }
}
