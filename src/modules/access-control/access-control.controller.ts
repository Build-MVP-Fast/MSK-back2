import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

import { AccessControlService } from './access-control.service';

@ApiTags('access-control')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('access-control')
export class AccessControlController {
  constructor(private readonly service: AccessControlService) {}

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Get('grants')
  listGrants(@Query() q: any) {
    return this.service.list(q);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Post('grants')
  grant(@Body() dto: any, @CurrentUser('id') userId: string) {
    return this.service.grant({ ...dto, grantedById: userId });
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Delete('grants/:id')
  revoke(@Param('id') id: string) {
    return this.service.revoke(id);
  }

  @Roles(UserRole.SUPER_USER)
  @Get('roles')
  listRoles() {
    return this.service.listRoles();
  }

  @Roles(UserRole.SUPER_USER)
  @Post('roles')
  createRole(@Body() dto: any) {
    return this.service.createRole(dto);
  }

  @Roles(UserRole.SUPER_USER)
  @Post('roles/:roleId/permissions/:permissionId')
  attachPermission(@Param('roleId') roleId: string, @Param('permissionId') permissionId: string) {
    return this.service.attachPermission(roleId, permissionId);
  }

  @Roles(UserRole.SUPER_USER)
  @Delete('roles/:roleId/permissions/:permissionId')
  detachPermission(@Param('roleId') roleId: string, @Param('permissionId') permissionId: string) {
    return this.service.detachPermission(roleId, permissionId);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Post('users/:userId/roles/:roleId')
  assignRole(
    @Param('userId') userId: string,
    @Param('roleId') roleId: string,
    @Body() body: { scopeType?: string; scopeId?: string },
  ) {
    return this.service.assignRole(userId, roleId, body.scopeType ? { type: body.scopeType, id: body.scopeId } : undefined);
  }
}
