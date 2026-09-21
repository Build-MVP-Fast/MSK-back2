import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
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

  /** Get Mews connection status for a property (or all properties). */
  @Get("status")
  status(@Query("propertyId") propertyId?: string) {
    return this.service.getStatus(propertyId);
  }

  /** Check whether the global Mews CLIENT_TOKEN env var is configured. */
  @Get("config")
  config() {
    return this.service.getConfig();
  }

  /** Manually trigger a mirror — all Mews-backed properties, or one. */
  @Post("run")
  run(@Body() body: { propertyId?: string }) {
    if (body?.propertyId) {
      return this.service.syncProperty(body.propertyId);
    }
    // A full sync across all properties can take minutes, so run it in the
    // background and return immediately rather than holding the request open.
    void this.service.syncAll().catch(() => undefined);
    return { started: true };
  }

  /** Save Mews credentials on a property. */
  @Post("credentials")
  credentials(
    @Body()
    body: {
      propertyId: string;
      accessToken: string;
      enterpriseId?: string;
    },
  ) {
    return this.service.saveCredentials(
      body.propertyId,
      body.accessToken,
      body.enterpriseId,
    );
  }
}
