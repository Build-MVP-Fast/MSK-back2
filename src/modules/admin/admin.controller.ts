import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AdminService } from './admin.service';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_USER)
@Controller('admin')
export class AdminController {
  constructor(private readonly service: AdminService) {}

  @Get('stats')
  stats() {
    return this.service.platformStats();
  }

  @Get('operators')
  operators() {
    return this.service.operators();
  }

  @Patch('operators/:id/status')
  updateOperatorStatus(@Param('id') id: string, @Body() dto: { status: 'ACTIVE' | 'SUSPENDED' | 'INACTIVE' }) {
    return this.service.updateOperatorStatus(id, dto.status);
  }

  @Get('guests')
  guests() {
    return this.service.guests();
  }

  @Get('properties')
  properties() {
    return this.service.properties();
  }

  @Get('subscriptions')
  subscriptions() {
    return this.service.subscriptions();
  }

  @Patch('subscriptions/:companyId')
  upsertSubscription(@Param('companyId') companyId: string, @Body() dto: any) {
    return this.service.upsertSubscription(companyId, dto);
  }
}
