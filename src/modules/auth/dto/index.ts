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
  /**
   * Accepts either a real email or the username chosen at signup
   * (stored on User.metadata.username). The auth service routes the
   * lookup based on whether the value matches an email pattern.
   */
  @IsString()
  email!: string;

  // Login validation intentionally only checks shape, not length. Any
  // mismatch (too short, too long, wrong format) is handled by the auth
  // service and surfaces as a generic 401 "Invalid credentials". Leaking
  // "password must be at least 8 characters" or similar on login both
  // confuses users typing a familiar password and gives an attacker free
  // information about the password policy.
  @IsString()
  password!: string;

  /**
   * Optional role hint from the role-select screen on the mobile app.
   * Lets the same email/username be used for multiple role-accounts
   * (Supplier + Property Operator + Staff under one human). When
   * present the lookup is narrowed to that role; when absent the
   * lookup falls back to "any role" (legacy behaviour).
   */
  @IsOptional()
  @IsString()
  @IsIn(['STAFF', 'SUPERVISOR', 'RECEPTIONIST', 'SUPPLIER', 'ADMIN', 'SUPER_USER'])
  role?: 'STAFF' | 'SUPERVISOR' | 'RECEPTIONIST' | 'SUPPLIER' | 'ADMIN' | 'SUPER_USER';
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

/**
 * Used by the mobile staff onboarding wizard. Backend caller picks the
 * role (STAFF / SUPERVISOR / RECEPTIONIST / SUPPLIER); ADMIN / SUPER_USER
 * have their own dedicated registration paths.
 */
export class RegisterStaffDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  firstName!: string;

  @IsString()
  lastName!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  selfieUrl?: string;

  @IsOptional()
  @IsIn(['STAFF', 'SUPERVISOR', 'RECEPTIONIST', 'SUPPLIER', 'ADMIN'])
  role?: 'STAFF' | 'SUPERVISOR' | 'RECEPTIONIST' | 'SUPPLIER' | 'ADMIN';

  /**
   * Optional business fields used by the Property Operator onboarding
   * wizard. When `role === ADMIN` and `businessName` is provided we
   * create a Company row and link the new user to it; subsequent
   * Property / Department / etc. calls can default companyId from the
   * JWT instead of failing UUID validation.
   */
  @IsOptional()
  @IsString()
  businessName?: string;

  @IsOptional()
  @IsString()
  businessEmail?: string;

  @IsOptional()
  @IsString()
  businessAddress?: string;
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
