import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';

import { PermissionsService } from './permissions.service';

const EDIT_PERMISSION = 'users.edit-permissions';

@ApiTags('permissions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly service: PermissionsService) {}

  // ── Catalog + matrix reads ──────────────────────────────────────────

  // Anyone authenticated can list the catalog — the admin UI uses it to
  // render checkbox labels and groupings even for staff who can only
  // see-but-not-edit. Edit gates only apply to mutations below.
  @Get('catalog')
  catalog() {
    return this.service.listCatalog();
  }

  @Get('roles')
  @RequirePermission(EDIT_PERMISSION)
  matrix() {
    return this.service.listAllRolePermissions();
  }

  @Get('users/:userId/overrides')
  @RequirePermission(EDIT_PERMISSION)
  userOverrides(@Param('userId') userId: string) {
    return this.service.listUserOverrides(userId);
  }

  /**
   * Effective permissions for an arbitrary user — used by the per-user
   * override editor to show the current set with inherited-vs-override
   * indicators.
   */
  @Get('users/:userId/effective')
  @RequirePermission(EDIT_PERMISSION)
  async effective(@Param('userId') userId: string) {
    const codes = await this.service.effectivePermissionsByUserId(userId);
    return { codes: codes ?? [] };
  }

  // ── Matrix writes ────────────────────────────────────────────────────

  @Put('roles/:role')
  @RequirePermission(EDIT_PERMISSION)
  async setRole(
    @Param('role') role: UserRole,
    @Body() body: { codes: string[] },
  ) {
    if (!Array.isArray(body?.codes)) {
      return { error: 'Body must be { codes: string[] }' };
    }
    await this.service.setRolePermissions(role, body.codes);
    return { ok: true, role, count: body.codes.length };
  }

  @Post('users/:userId/overrides')
  @RequirePermission(EDIT_PERMISSION)
  async setOverride(
    @Param('userId') userId: string,
    @Body() body: { permissionCode: string; mode: 'grant' | 'revoke' | 'clear' },
  ) {
    if (!body?.permissionCode || !body?.mode) {
      return { error: 'Body must be { permissionCode, mode }' };
    }
    await this.service.setUserOverride(userId, body.permissionCode, body.mode);
    return { ok: true };
  }

  @Delete('users/:userId/overrides/:code')
  @RequirePermission(EDIT_PERMISSION)
  async clearOverride(
    @Param('userId') userId: string,
    @Param('code') code: string,
  ) {
    await this.service.setUserOverride(userId, code, 'clear');
    return { ok: true };
  }
}
