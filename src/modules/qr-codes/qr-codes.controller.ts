import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { QrCodeTarget, UserRole } from '@prisma/client';

import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

import { QrCodesService } from './qr-codes.service';

@ApiTags('qr-codes')
@Controller('qr-codes')
export class QrCodesController {
  constructor(private readonly service: QrCodesService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Get()
  list(
    @Query() q: { propertyId?: string; target?: QrCodeTarget },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // SUPER_USER (platform) sees everything; ADMIN is scoped to their company.
    const companyId = user.role === UserRole.SUPER_USER ? undefined : user.companyId;
    return this.service.list({ ...q, companyId });
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Post()
  generate(@Body() dto: any, @CurrentUser() user: AuthenticatedUser) {
    return this.service.generate({ ...dto, companyId: dto.companyId ?? user.companyId });
  }

  /** The signed-in staff/operator's own personal QR (get-or-create). */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STAFF, UserRole.ADMIN, UserRole.SUPER_USER, UserRole.RECEPTIONIST, UserRole.SUPERVISOR)
  @Get('me/staff')
  myStaffQr(@CurrentUser('id') userId: string) {
    return this.service.getOrCreateMyStaffQr(userId);
  }

  @Public()
  @Get('resolve/:code')
  resolve(@Param('code') code: string) {
    return this.service.resolve(code);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('scan/:code')
  scan(@Param('code') code: string, @Body() body: any, @CurrentUser('id') userId: string) {
    return this.service.recordScan(code, userId, body);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Delete(':id')
  deactivate(@Param('id') id: string) {
    return this.service.deactivate(id);
  }
}
