import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

import { FinanceService } from './finance.service';
import { ReportsService } from './reports.service';

@ApiTags('finance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('finance')
export class FinanceController {
  constructor(
    private readonly service: FinanceService,
    private readonly reports: ReportsService,
  ) {}

  // ---- Costs --------------------------------------------------------------
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Get('costs')
  listCosts(@Query() q: any) {
    return this.service.listCosts({
      ...q,
      from: q.from ? new Date(q.from) : undefined,
      to: q.to ? new Date(q.to) : undefined,
    });
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Post('costs')
  createCost(@Body() dto: any, @CurrentUser('id') userId: string) {
    return this.service.createCost({ ...dto, createdById: userId });
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Patch('costs/:id')
  updateCost(@Param('id') id: string, @Body() dto: any) {
    return this.service.updateCost(id, dto);
  }

  @Roles(UserRole.SUPER_USER)
  @Delete('costs/:id')
  removeCost(@Param('id') id: string) {
    return this.service.removeCost(id);
  }

  // ---- Revenue ------------------------------------------------------------
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Get('revenue')
  listRevenue(@Query() q: any) {
    return this.service.listRevenue({
      ...q,
      from: q.from ? new Date(q.from) : undefined,
      to: q.to ? new Date(q.to) : undefined,
    });
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Post('revenue')
  createRevenue(@Body() dto: any, @CurrentUser('id') userId: string) {
    return this.service.createRevenue({ ...dto, recordedById: userId });
  }

  // ---- Reports ------------------------------------------------------------
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Get('reports/p-and-l')
  pAndL(@Query() q: any) {
    return this.reports.profitAndLoss({
      ...q,
      from: q.from ? new Date(q.from) : undefined,
      to: q.to ? new Date(q.to) : undefined,
    });
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Get('reports/revenue-by-month')
  revenueByMonth(@Query() q: any) {
    return this.reports.revenueByMonth({
      ...q,
      from: q.from ? new Date(q.from) : undefined,
      to: q.to ? new Date(q.to) : undefined,
    });
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Get('reports/staff-cost')
  staffCost(@Query() q: any) {
    return this.reports.staffCost({
      ...q,
      from: q.from ? new Date(q.from) : undefined,
      to: q.to ? new Date(q.to) : undefined,
    });
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Get('reports/material-cost')
  materialCost(@Query() q: any) {
    return this.reports.materialCost({
      ...q,
      from: q.from ? new Date(q.from) : undefined,
      to: q.to ? new Date(q.to) : undefined,
    });
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Get('reports/booking-metrics')
  bookingMetrics(@Query() q: any) {
    return this.reports.bookingMetrics({
      propertyId: q.propertyId,
      from: new Date(q.from),
      to: new Date(q.to),
    });
  }
}
