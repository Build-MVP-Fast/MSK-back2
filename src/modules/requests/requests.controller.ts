import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

import { RequestsService } from './requests.service';

@ApiTags('guest-requests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('guest-requests')
export class RequestsController {
  constructor(private readonly service: RequestsService) {}

  @Roles(UserRole.WEB_GUEST, UserRole.ADMIN, UserRole.SUPER_USER, UserRole.RECEPTIONIST)
  @Get()
  list(@Query() q: any, @CurrentUser('role') role: UserRole, @CurrentUser('id') userId: string) {
    if (role === UserRole.WEB_GUEST) {
      return this.service.list({ ...q, requestedById: userId });
    }
    return this.service.list(q);
  }

  @Roles(UserRole.WEB_GUEST, UserRole.RECEPTIONIST)
  @Post()
  create(@Body() dto: any, @CurrentUser('id') userId: string) {
    return this.service.create({ ...dto, requestedById: userId });
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER, UserRole.RECEPTIONIST)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: any) {
    return this.service.update(id, dto);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER, UserRole.RECEPTIONIST)
  @Post(':id/resolve')
  resolve(@Param('id') id: string) {
    return this.service.resolve(id);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER, UserRole.RECEPTIONIST)
  @Post(':id/assign/:userId')
  assign(@Param('id') id: string, @Param('userId') userId: string) {
    return this.service.assign(id, userId);
  }
}
