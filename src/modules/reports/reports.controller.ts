import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { companyScope } from '../../common/util/company-scope';

import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Get('admin-overview')
  adminOverview(@CurrentUser() user: AuthenticatedUser, @Query('companyId') companyId?: string) {
    return this.service.adminOverview(companyScope(user, companyId));
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

  /**
   * Chart data for the Property Operator Reports tab. Returns:
   *  - operations: totalJobs / completed / pending (last 30 days)
   *  - jobsLast7Days: 7-point series for the completed-tasks line chart
   *  - performanceByDepartment: 4-point series (one bar per dept) of
   *    completion rate (% completed within the last 30 days)
   *  - performanceRate: average completion rate over the last 30 days
   */
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Get('admin-charts')
  adminCharts(
    @CurrentUser() user: AuthenticatedUser,
    @Query('companyId') companyId?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.service.adminCharts(companyScope(user, companyId), departmentId);
  }
}
