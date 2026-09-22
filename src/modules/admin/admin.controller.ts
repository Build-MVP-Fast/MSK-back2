import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
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

  @Post('properties/:id/archive')
  archiveProperty(@Param('id') id: string) {
    return this.service.archiveProperty(id);
  }

  @Post('properties/:id/publish')
  publishProperty(@Param('id') id: string) {
    return this.service.publishProperty(id);
  }

  @Get('subscriptions')
  subscriptions() {
    return this.service.subscriptions();
  }

  @Patch('subscriptions/:companyId')
  upsertSubscription(@Param('companyId') companyId: string, @Body() dto: any) {
    return this.service.upsertSubscription(companyId, dto);
  }

  @Patch('subscriptions/:companyId/modules')
  updateModules(@Param('companyId') companyId: string, @Body() dto: { enabledModules: string[] }) {
    return this.service.updateSubscriptionModules(companyId, dto.enabledModules);
  }

  @Delete('operators/:id')
  deleteOperator(@Param('id') id: string) {
    return this.service.deleteOperator(id);
  }

  /** Send a platform message to an operator (stored as support ticket). */
  @Post('operators/:id/message')
  messageOperator(
    @Param('id') id: string,
    @Body() dto: { message: string },
  ) {
    return this.service.messageOperator(id, dto.message);
  }

  /** Update enabled modules for an operator (alias for subscriptions endpoint). */
  @Patch('operators/:id/modules')
  updateOperatorModules(
    @Param('id') id: string,
    @Body() dto: { enabledModules: string[] },
  ) {
    return this.service.updateSubscriptionModules(id, dto.enabledModules);
  }

  @Delete('guests/:id')
  deleteGuest(@Param('id') id: string) {
    return this.service.deleteGuest(id);
  }

  @Get('invites')
  listInvites() {
    return this.service.listInvites();
  }

  @Post('invites')
  createInvite(@Body() dto: { email: string; role?: string; accessPages?: string[] }) {
    return this.service.createInvite(dto);
  }

  @Delete('invites/:id')
  deleteInvite(@Param('id') id: string) {
    return this.service.deleteInvite(id);
  }
}
