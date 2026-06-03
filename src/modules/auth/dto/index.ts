import { OtpPurpose } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MinLength,
} from 'class-validator';

export class RegisterWebGuestDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  lastName!: string;
}

export class LoginEmailDto {
  @IsEmail()
  email!: string;

  // Login validation intentionally only checks shape, not length. Any
  // mismatch (too short, too long, wrong format) is handled by the auth
  // service and surfaces as a generic 401 "Invalid credentials". Leaking
  // "password must be at least 8 characters" or similar on login both
  // confuses users typing a familiar password and gives an attacker free
  // information about the password policy.
  @IsString()
  password!: string;
}

export class RegisterGuestDto {
  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsString()
  @Length(4, 6)
  pin!: string;
}

export class RegisterAdminDto {
  @IsEmail()
  email!: string;

  @IsString()
  phone!: string;

  @IsString()
  firstName!: string;

  @IsString()
  lastName!: string;

  @IsString()
  @Length(4, 6)
  pin!: string;

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  companyName?: string;
}

export class LoginPinDto {
  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  // Same reasoning as LoginEmailDto.password — login DTO only validates
  // shape. A frontend bug (cached old chunk, browser autofill, retry
  // logic) that ever sends a >6-char value to /auth/login/pin should
  // surface as "Invalid credentials", not "pin must be shorter than or
  // equal to 6 characters" which the actual user this happened to today
  // (June 2026) was rightly confused by.
  @IsString()
  pin!: string;
}

export class ResetPasswordDto {
  @IsEmail()
  email!: string;

  @IsString()
  code!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}

export class ResetPinDto {
  @IsString()
  destination!: string;

  @IsString()
  code!: string;

  @IsString()
  @Length(4, 6)
  newPin!: string;
}

export class RequestOtpDto {
  @IsString()
  destination!: string;

  @IsIn(['email', 'sms'])
  channel!: 'email' | 'sms';

  @IsEnum(OtpPurpose)
  purpose!: OtpPurpose;
}

export class VerifyOtpDto {
  @IsString()
  destination!: string;

  @IsString()
  code!: string;

  @IsEnum(OtpPurpose)
  purpose!: OtpPurpose;
}

export class ReservationEnquiryDto {
  @IsString()
  reference!: string;

  @IsString()
  lastName!: string;
}

export class RefreshTokenDto {
  @IsString()
  refreshToken!: string;
}
