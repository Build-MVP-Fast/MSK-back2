import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { OrderStatus, UserRole } from '@prisma/client';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

import { OrdersService } from './orders.service';

@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly service: OrdersService) {}

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Get()
  list(@Query() q: { status?: OrderStatus }) {
    return this.service.list(q);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Get(':id')
  detail(@Param('id') id: string) {
    return this.service.detail(id);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Post()
  create(@Body() dto: any, @CurrentUser('id') userId: string) {
    return this.service.create({ ...dto, createdById: userId });
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Post(':id/status')
  setStatus(@Param('id') id: string, @Body() body: { status: OrderStatus }) {
    return this.service.setStatus(id, body.status);
  }
}
