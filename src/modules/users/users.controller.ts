import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER, UserRole.RECEPTIONIST)
  @Get()
  list(@Query() q: any) {
    return this.service.list(q);
  }

  @Get('me')
  me(@CurrentUser('id') userId: string) {
    return this.service.detail(userId);
  }

  @Patch('me')
  updateMe(@Body() dto: any, @CurrentUser('id') userId: string) {
    return this.service.update(userId, dto);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER, UserRole.RECEPTIONIST)
  @Get(':id')
  detail(@Param('id') id: string) {
    return this.service.detail(id);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: any) {
    return this.service.update(id, dto);
  }

  @Roles(UserRole.SUPER_USER)
  @Delete(':id')
  deactivate(@Param('id') id: string) {
    return this.service.deactivate(id);
  }

  @Post(':guestProfileId/additional-guests')
  addAdditionalGuest(@Param('guestProfileId') guestProfileId: string, @Body() dto: any) {
    return this.service.addAdditionalGuest(guestProfileId, dto);
  }

  @Delete('additional-guests/:id')
  removeAdditionalGuest(@Param('id') id: string) {
    return this.service.removeAdditionalGuest(id);
  }
}
