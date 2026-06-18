import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Get('admin-overview')
  adminOverview(@Query('companyId') companyId?: string) {
    return this.service.adminOverview(companyId);
  }

  @Roles(UserRole.SUPER_USER)
  @Get('super-overview')
  superOverview() {
    return this.service.superOverview();
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER, UserRole.RECEPTIONIST)
  @Get('receptionist-overview')
  receptionistOverview(@Query('propertyId') propertyId?: string) {
    return this.service.receptionistOverview(propertyId);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER, UserRole.SUPERVISOR)
  @Get('supervisor-overview')
  supervisorOverview(@CurrentUser('id') userId: string) {
    return this.service.supervisorOverview(userId);
  }
}
