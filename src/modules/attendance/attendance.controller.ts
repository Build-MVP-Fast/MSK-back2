import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { companyScope } from '../../common/util/company-scope';

import { AttendanceService } from './attendance.service';

interface ClockInBody {
  lat?: number;
  lng?: number;
}

interface ClockOutBody {
  note?: string;
  lat?: number;
  lng?: number;
}

function parseDate(v?: string): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d;
}

@ApiTags('attendance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly service: AttendanceService) {}

  @Post('clock-in')
  clockIn(@CurrentUser('id') userId: string, @Body() body: ClockInBody) {
    return this.service.clockIn(userId, { lat: body?.lat, lng: body?.lng });
  }

  @Post('clock-out')
  clockOut(@CurrentUser('id') userId: string, @Body() body: ClockOutBody) {
    return this.service.clockOut(userId, body?.note, { lat: body?.lat, lng: body?.lng });
  }

  @Get('me/current')
  current(@CurrentUser('id') userId: string) {
    return this.service.current(userId);
  }

  @Get('me')
  myHistory(
    @CurrentUser('id') userId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.history(userId, { from: parseDate(from), to: parseDate(to) });
  }

  @Get('me/summary')
  mySummary(
    @CurrentUser('id') userId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.summary(userId, { from: parseDate(from), to: parseDate(to) });
  }

  // ── Supervisor / admin views ─────────────────────────────────────
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER, UserRole.SUPERVISOR)
  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.list({
      userId,
      from: parseDate(from),
      to: parseDate(to),
      companyId: companyScope(user),
    });
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER, UserRole.SUPERVISOR)
  @Get(':userId/history')
  userHistory(
    @Param('userId') userId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.history(userId, { from: parseDate(from), to: parseDate(to) });
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER, UserRole.SUPERVISOR)
  @Get(':userId/summary')
  userSummary(
    @Param('userId') userId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.summary(userId, { from: parseDate(from), to: parseDate(to) });
  }
}
