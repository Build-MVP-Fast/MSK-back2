import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtService } from '@nestjs/jwt';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BookingSource, UserRole } from '@prisma/client';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { StorageService } from '../photos/storage.service';

import {
  AssignRoomDto,
  CalendarQueryDto,
  CancelBookingDto,
  CreateBookingDto,
  ListBookingsQueryDto,
} from './dto';
import {
  CheckInEmailCodeDto,
  CheckInStartDto,
  CheckInSubmitDto,
  CheckInVerifyDto,
} from './check-in.dto';
import {
  CheckOutOtpRequestDto,
  CheckOutOtpVerifyDto,
  CheckOutSignInCodeDto,
  CheckOutSignInCredentialsDto,
  CheckOutSubmitDto,
} from './check-out.dto';
import { BookingsService } from './bookings.service';
import {
  CheckInTokenGuard,
  CheckOutTokenGuard,
  buildCheckInToken,
  buildCheckOutToken,
} from './check-in-token';

@ApiTags('bookings')
@Controller('bookings')
export class BookingsController {
  constructor(
    private readonly service: BookingsService,
    private readonly storage: StorageService,
    private readonly jwt: JwtService,
  ) {}

  // ── Mobile guest-wizard check-in ───────────────────────────────────────
  //
  // Five public endpoints powering the in-app check-in flow. /start and
  // /verify are unauthenticated (the guest hasn't logged in); the remaining
  // three require a short-lived "check-in" scoped JWT issued by /verify.
  // See check-in-token.ts.

  /**
   * Pre-fill lookup. The wizard fires this as soon as the guest finishes
   * typing the reservation reference on Page 1, so the Property + Room
   * Type fields can populate without waiting for the OTP round-trip.
   * No token is issued — sensitive actions still require /verify.
   */
  @Public()
  @Post('public/check-in/lookup')
  checkInLookup(@Body() dto: { reference: string }) {
    return this.service.checkInLookup(dto.reference);
  }

  @Public()
  @Post('public/check-in/start')
  checkInStart(@Body() dto: CheckInStartDto) {
    return this.service.checkInStart(dto.reference, dto.lastName);
  }

  @Public()
  @Post('public/check-in/verify')
  async checkInVerify(@Body() dto: CheckInVerifyDto) {
    const result = await this.service.checkInVerify(
      dto.reference,
      dto.lastName,
      dto.code,
    );
    const checkInToken = await buildCheckInToken(this.jwt, result.bookingId);
    return { ...result, checkInToken };
  }

  /**
   * "Send to accommodation" button on the Success page — patches the
   * booking's additionalInfoText. Re-callable, doesn't touch status.
   */
  @Public()
  @UseGuards(CheckInTokenGuard)
  @Post('public/check-in/note')
  checkInSetNote(
    @Req() req: { bookingId: string },
    @Body() dto: { text: string },
  ) {
    return this.service.checkInSetNote(req.bookingId, dto.text ?? '');
  }

  @Public()
  @UseGuards(CheckInTokenGuard)
  @Post('public/check-in/email-code')
  checkInEmailCode(
    @Req() req: { bookingId: string },
    @Body() dto: CheckInEmailCodeDto,
  ) {
    return this.service.checkInEmailCode(req.bookingId, dto.email);
  }

  @Public()
  @UseGuards(CheckInTokenGuard)
  @Post('public/check-in/upload-signature')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } }))
  async checkInUploadSignature(
    @Req() req: { bookingId: string },
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded. Field name must be "file".');
    }
    const folder = `check-in/${req.bookingId}/signature`;
    const { url } = await this.storage.upload(file.buffer, file.mimetype, folder);
    return { url };
  }

  @Public()
  @UseGuards(CheckInTokenGuard)
  @Post('public/check-in/submit')
  checkInSubmit(
    @Req() req: { bookingId: string },
    @Body() dto: CheckInSubmitDto,
  ) {
    return this.service.checkInSubmit(req.bookingId, dto);
  }

  // ── Mobile guest-wizard checkout ──────────────────────────────────────
  //
  // Three sign-in modes mirroring the checkout screen UI: email +
  // password, the 6-digit check-in code, or an emailed OTP. Each
  // returns a check-out scoped JWT the rest of the flow runs against.

  @Public()
  @Post('public/check-out/sign-in/credentials')
  async checkOutSignInCredentials(@Body() dto: CheckOutSignInCredentialsDto) {
    const result = await this.service.checkOutSignInWithCredentials(
      dto.email,
      dto.password,
    );
    const checkOutToken = await buildCheckOutToken(this.jwt, result.userId, 'user');
    return { checkOutToken, mode: 'user' as const };
  }

  @Public()
  @Post('public/check-out/sign-in/code')
  async checkOutSignInCode(@Body() dto: CheckOutSignInCodeDto) {
    const result = await this.service.checkOutSignInWithCode(dto.code);
    const checkOutToken = await buildCheckOutToken(this.jwt, result.sub, result.mode);
    return { checkOutToken, mode: result.mode };
  }

  @Public()
  @Post('public/check-out/sign-in/otp/request')
  checkOutRequestOtp(@Body() dto: CheckOutOtpRequestDto) {
    return this.service.checkOutRequestOtp(dto.email);
  }

  @Public()
  @Post('public/check-out/sign-in/otp/verify')
  async checkOutVerifyOtp(@Body() dto: CheckOutOtpVerifyDto) {
    const result = await this.service.checkOutVerifyOtp(dto.email, dto.code);
    const checkOutToken = await buildCheckOutToken(this.jwt, result.userId, 'user');
    return { checkOutToken, mode: 'user' as const };
  }

  /** RESERVATION page — list bookings the holder can check out of. */
  @Public()
  @UseGuards(CheckOutTokenGuard)
  @Post('public/check-out/list-active')
  checkOutListActive(
    @Req() req: { checkOutSub: string; checkOutMode: 'user' | 'booking' },
  ) {
    return this.service.checkOutListActive(req.checkOutSub, req.checkOutMode);
  }

  /**
   * DETAILS page — uploads one image at a time (room / bathroom /
   * key-location). Returns its S3 URL which the mobile client collects
   * into arrays and POSTs back with /check-out/submit.
   */
  @Public()
  @UseGuards(CheckOutTokenGuard)
  @Post('public/check-out/upload-photo')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024 } }))
  async checkOutUploadPhoto(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded.');
    const { url } = await this.storage.upload(
      file.buffer,
      file.mimetype || 'image/jpeg',
      'check-out',
    );
    return { url };
  }

  @Public()
  @UseGuards(CheckOutTokenGuard)
  @Post('public/check-out/submit')
  checkOutSubmit(
    @Req() req: { checkOutSub: string; checkOutMode: 'user' | 'booking' },
    @Body() dto: CheckOutSubmitDto,
  ) {
    return this.service.checkOutSubmit(req.checkOutSub, req.checkOutMode, dto);
  }

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
  @RequirePermission('bookings.cancel')
  @Post(':id/cancel')
  cancel(@Param('id') id: string, @Body() body: CancelBookingDto) {
    return this.service.cancel(id, body.reason);
  }

  /**
   * Pin (or unassign) a specific physical room on an active booking.
   * Routed BEFORE the generic `:id` PATCH so the validated DTO and the
   * domain-aware service path always handle assignments. Calendar
   * drag-to-different-room uses this same endpoint, so the permission
   * gate is `bookings.move-room` (vertical drag).
   */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER, UserRole.RECEPTIONIST)
  @RequirePermission('bookings.move-room')
  @Patch(':id/assign-room')
  assignRoom(@Param('id') id: string, @Body() dto: AssignRoomDto) {
    return this.service.assignRoom(id, dto.roomId ?? null);
  }

  /**
   * Move a booking's check-in / check-out dates. Calendar
   * drag-horizontally uses this endpoint; the permission gate is
   * `bookings.move-dates`. Body: { checkIn: 'YYYY-MM-DD', checkOut: 'YYYY-MM-DD' }.
   */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER, UserRole.RECEPTIONIST)
  @RequirePermission('bookings.move-dates')
  @Patch(':id/dates')
  moveDates(
    @Param('id') id: string,
    @Body() body: { checkIn: string; checkOut: string },
  ) {
    return this.service.moveDates(id, body.checkIn, body.checkOut);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER, UserRole.RECEPTIONIST)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Record<string, unknown>) {
    return this.service.update(id, dto);
  }
}
