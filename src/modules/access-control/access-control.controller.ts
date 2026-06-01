import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

import { AccessControlService } from './access-control.service';

// Legacy /roles + /users/:id/roles endpoints were removed when the
// granular permission system superseded them. Role + permission
// management now lives in PermissionsModule (/permissions).
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
}
