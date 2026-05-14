import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BookingSource, UserRole } from '@prisma/client';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

import {
  AssignRoomDto,
  CalendarQueryDto,
  CancelBookingDto,
  CreateBookingDto,
  ListBookingsQueryDto,
} from './dto';
import { BookingsService } from './bookings.service';

@ApiTags('bookings')
@Controller('bookings')
export class BookingsController {
  constructor(private readonly service: BookingsService) {}

  // ── Public guest checkout ──────────────────────────────────────────────

  /**
   * Public booking creation. The controller forces source=WEBSITE here so
   * a malicious client can't stamp a booking as ADMIN by sending a
   * different value in the DTO.
   */
  @Public()
  @Post('public')
  publicCreate(@Body() dto: CreateBookingDto) {
    return this.service.create({
      ...dto,
      source: BookingSource.WEBSITE,
    });
  }

  /**
   * Public lookup by reference (no auth) — confirmation pages and
   * reservation-enquiry flows use this. Email is optional but if supplied
   * must match the booking's guestEmail.
   */
  @Public()
  @Get('public/by-reference/:reference')
  publicByReference(
    @Param('reference') reference: string,
    @Query('email') email?: string,
  ) {
    return this.service.findByReference(reference, email);
  }

  // ── Admin / staff routes ───────────────────────────────────────────────

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER, UserRole.RECEPTIONIST)
  @Post()
  adminCreate(@Body() dto: CreateBookingDto) {
    return this.service.create({
      ...dto,
      source: dto.source ?? BookingSource.ADMIN,
    });
  }

  /**
   * Calendar/Gantt view: rooms × days × bookings for a property over a
   * date window (max 90 days). Routed BEFORE `:id` so "calendar" isn't
   * captured by the param-route catch-all.
   */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER, UserRole.RECEPTIONIST)
  @Get('calendar')
  calendar(@Query() query: CalendarQueryDto) {
    return this.service.calendar(
      query.propertyId,
      new Date(query.from),
      new Date(query.to),
    );
  }

  /**
   * Bookings belonging to the authenticated guest — feeds the website's
   * profile page. Public route would be wrong (it'd leak by user-id);
   * any JWT is enough, no role restriction.
   */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('my')
  myBookings(
    @CurrentUser('id') userId: string,
    @CurrentUser('email') email: string | null,
  ) {
    return this.service.mine(userId, email);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER, UserRole.RECEPTIONIST)
  @Get()
  list(@Query() query: ListBookingsQueryDto) {
    return this.service.list({
      status: query.status,
      propertyId: query.propertyId,
      source: query.source,
      checkInFrom: query.checkInFrom ? new Date(query.checkInFrom) : undefined,
      checkInTo: query.checkInTo ? new Date(query.checkInTo) : undefined,
      q: query.q,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get(':id')
  detail(@Param('id') id: string) {
    return this.service.detail(id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER, UserRole.RECEPTIONIST)
  @Post(':id/check-in')
  checkIn(@Param('id') id: string) {
    return this.service.checkIn(id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER, UserRole.RECEPTIONIST)
  @Post(':id/check-out')
  checkOut(@Param('id') id: string) {
    return this.service.checkOut(id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    UserRole.ADMIN,
    UserRole.SUPER_USER,
    UserRole.RECEPTIONIST,
    UserRole.WEB_GUEST,
  )
  @Post(':id/cancel')
  cancel(@Param('id') id: string, @Body() body: CancelBookingDto) {
    return this.service.cancel(id, body.reason);
  }

  /**
   * Pin (or unassign) a specific physical room on an active booking.
   * Routed BEFORE the generic `:id` PATCH so the validated DTO and the
   * domain-aware service path always handle assignments.
   */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER, UserRole.RECEPTIONIST)
  @Patch(':id/assign-room')
  assignRoom(@Param('id') id: string, @Body() dto: AssignRoomDto) {
    return this.service.assignRoom(id, dto.roomId ?? null);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER, UserRole.RECEPTIONIST)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Record<string, unknown>) {
    return this.service.update(id, dto);
  }
}
