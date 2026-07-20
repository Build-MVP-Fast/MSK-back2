import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { companyScope } from "../../common/util/company-scope";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";

import { AppAccessService } from "./app-access.service";

@ApiTags("app-access")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_USER)
@Controller("app-access")
export class AppAccessController {
  constructor(private readonly service: AppAccessService) {}

  @Get("catalog")
  catalog() {
    return this.service.catalog();
  }

  @Get("roles")
  roles() {
    return this.service.roleMatrix();
  }

  @Put("roles/:role")
  setRole(@Param("role") role: string, @Body() body: { codes: string[] }) {
    return this.service.setRolePermissions(role, body.codes ?? []);
  }

  @Get("users")
  usersInRole(
    @Query("role") role: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.usersInRole(role, companyScope(user));
  }

  @Get("users/:id")
  userPermissions(@Param("id") id: string) {
    return this.service.userPermissions(id);
  }

  @Put("users/:id/overrides")
  setOverride(
    @Param("id") id: string,
    @Body() body: { code: string; mode: "grant" | "revoke" | "clear" },
  ) {
    return this.service.setUserOverride(id, body.code, body.mode);
  }
}
