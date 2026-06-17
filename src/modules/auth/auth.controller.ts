import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Request } from 'express';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { TokenService } from './token.service';
import { PermissionsService } from '../permissions/permissions.service';
import {
  LoginEmailDto,
  LoginPinDto,
  RegisterAdminDto,
  RegisterGuestDto,
  RegisterStaffDto,
  RegisterWebGuestDto,
  RefreshTokenDto,
  RequestOtpDto,
  ReservationEnquiryDto,
  ResetPasswordDto,
  ResetPinDto,
  VerifyOtpDto,
} from './dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly otp: OtpService,
    private readonly tokens: TokenService,
    private readonly permissions: PermissionsService,
  ) {}

  // ---- Website (email/password) -------------------------------------------

  @Public()
  @Post('register/web-guest')
  registerWebGuest(@Body() dto: RegisterWebGuestDto) {
    return this.auth.registerWebGuest(dto);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login/email')
  loginEmail(@Body() dto: LoginEmailDto, @Req() req: Request) {
    return this.auth.loginWithEmail(dto, req);
  }

  /**
   * Mobile app email + password login. Separate endpoint from
   * `/login/email` so msk-admin (PLATFORM lane) and the mobile app
   * (APP lane) never authenticate each other's accounts.
   */
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login/email/app')
  loginEmailApp(@Body() dto: LoginEmailDto, @Req() req: Request) {
    return this.auth.loginWithEmailApp(dto, req);
  }

  /**
   * Mobile guest sign-in. Step 1: dispatch a LOGIN OTP to the email.
   * Always returns `{ sent: true }` regardless of whether the account
   * exists — same shape used by the residence-website forgot-password
   * flow — to avoid account enumeration.
   */
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login/otp/request')
  requestLoginOtp(@Body() body: { email: string }) {
    return this.auth.requestLoginOtp(body.email);
  }

  /**
   * Mobile guest sign-in. Step 2: consume the LOGIN OTP and issue auth
   * tokens. Response matches /auth/login/email so the mobile authService
   * can persist `{ token, refreshToken, user }` the same way.
   */
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login/otp/verify')
  loginOtpVerify(@Body() body: { email: string; code: string }) {
    return this.auth.loginWithOtp(body.email, body.code);
  }

  /**
   * Mobile guest sign-in via the 6-digit check-in code. No email required;
   * the code itself identifies the booking and (transitively) the user.
   * Only works for CHECKED_IN bookings whose checkInCode was issued and
   * are linked to a real account.
   */
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login/code')
  loginByCheckInCode(@Body() body: { code: string }) {
    return this.auth.loginWithCheckInCode(body.code);
  }

  @Public()
  @Post('password/forgot')
  forgotPassword(@Body() dto: { email: string }) {
    return this.auth.requestPasswordReset(dto.email);
  }

  @Public()
  @Post('password/reset')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto);
  }

  // ---- Mobile app (PIN + OTP) ---------------------------------------------

  @Public()
  @Post('register/guest')
  registerGuest(@Body() dto: RegisterGuestDto) {
    return this.auth.registerGuest(dto);
  }

  @Public()
  @Post('register/admin')
  registerAdmin(@Body() dto: RegisterAdminDto) {
    return this.auth.registerAdmin(dto);
  }

  /**
   * Mobile staff onboarding wizard endpoint. Public — used by the
   * "(staff-wizard)" flow to create a STAFF / SUPERVISOR /
   * RECEPTIONIST / SUPPLIER account and return tokens so the new user
   * lands on their dashboard immediately.
   */
  @Public()
  @Post('register/staff')
  registerStaff(@Body() dto: RegisterStaffDto) {
    return this.auth.registerStaff(dto);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login/pin')
  loginPin(@Body() dto: LoginPinDto, @Req() req: Request) {
    return this.auth.loginWithPin(dto, req);
  }

  @Public()
  @Post('pin/forgot')
  forgotPin(@Body() dto: { phone?: string; email?: string }) {
    return this.auth.requestPinReset(dto);
  }

  @Public()
  @Post('pin/reset')
  resetPin(@Body() dto: ResetPinDto) {
    return this.auth.resetPin(dto);
  }

  // ---- OTP (shared) -------------------------------------------------------

  @Public()
  @Post('otp/request')
  requestOtp(@Body() dto: RequestOtpDto) {
    return this.otp.request(dto);
  }

  @Public()
  @Post('otp/verify')
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.otp.verify(dto);
  }

  // ---- Reservation enquiry (app feature) ----------------------------------

  @Public()
  @Post('reservation-enquiry')
  reservationEnquiry(@Body() dto: ReservationEnquiryDto) {
    return this.auth.reservationEnquiry(dto);
  }

  // ---- Tokens -------------------------------------------------------------

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('token/refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.tokens.refresh(dto.refreshToken);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  logout(@CurrentUser('id') userId: string, @Body() dto: RefreshTokenDto) {
    return this.tokens.revoke(userId, dto.refreshToken);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('me')
  me(@CurrentUser() user: unknown) {
    return user;
  }

  /**
   * Effective permission codes for the currently logged-in user — the
   * admin UI calls this on boot and caches it so buttons / nav items
   * can be hidden client-side without polling for every check.
   *
   * SUPER_USER is reported with the literal '*' marker so the frontend
   * helper can short-circuit (every `has(code)` returns true) without
   * needing to know the full catalog.
   */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('me/permissions')
  async myPermissions(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: UserRole,
    @CurrentUser('primaryRole') primaryRole: UserRole | undefined,
  ) {
    const effective = role === 'SUPER_USER' || primaryRole === 'SUPER_USER'
      ? ['*']
      : Array.from(
          await this.permissions.effectivePermissions(
            userId,
            primaryRole ?? role,
          ),
        ).sort();
    return { codes: effective };
  }

  /**
   * Self-service password / PIN change for the logged-in user. Body:
   * { currentSecret: string, newSecret: string }. Works for both
   * PASSWORD-based (web guest) and PIN-based (staff) accounts.
   */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('change-secret')
  changeSecret(
    @CurrentUser('id') userId: string,
    @Body() body: { currentSecret: string; newSecret: string },
  ) {
    return this.auth.changeSecret(userId, body.currentSecret, body.newSecret);
  }
}
