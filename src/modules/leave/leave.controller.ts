import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { LeaveStatus, UserRole } from '@prisma/client';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

import { CreateLeaveDto, LeaveService, ReviewLeaveDto } from './leave.service';

@ApiTags('leave')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('leave')
export class LeaveController {
  constructor(private readonly service: LeaveService) {}

  @Post()
  create(@CurrentUser('id') userId: string, @Body() dto: CreateLeaveDto) {
    return this.service.create(userId, dto);
  }

  @Get('me')
  mine(@CurrentUser('id') userId: string) {
    return this.service.mine(userId);
  }

  @Patch(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.cancel(id, userId);
  }

  // ── Manager / admin views ────────────────────────────────────────
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER, UserRole.SUPERVISOR)
  @Get()
  list(
    @Query('status') status?: LeaveStatus,
    @Query('userId') userId?: string,
  ) {
    return this.service.list({ status, userId });
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER, UserRole.SUPERVISOR)
  @Patch(':id/review')
  review(
    @Param('id') id: string,
    @CurrentUser('id') reviewerId: string,
    @Body() dto: ReviewLeaveDto,
  ) {
    return this.service.review(id, reviewerId, dto);
  }
}
