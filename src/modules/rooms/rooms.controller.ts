import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoomStatus, UserRole } from '@prisma/client';

import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { companyScope } from '../../common/util/company-scope';

import { CreateRoomDto, UpdateRoomDto } from './dto';
import { RoomsService } from './rooms.service';

@ApiTags('rooms')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('rooms')
export class RoomsController {
  constructor(private readonly service: RoomsService) {}

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER, UserRole.RECEPTIONIST)
  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('propertyId') propertyId?: string,
    @Query('roomTypeId') roomTypeId?: string,
    @Query('status') status?: RoomStatus,
  ) {
    return this.service.list(propertyId, roomTypeId, companyScope(user), status);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER, UserRole.RECEPTIONIST)
  @Get(':id')
  detail(@Param('id') id: string) {
    return this.service.detail(id);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Post()
  create(@Body() dto: CreateRoomDto) {
    return this.service.create(dto);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER, UserRole.RECEPTIONIST)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateRoomDto) {
    return this.service.update(id, dto);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
