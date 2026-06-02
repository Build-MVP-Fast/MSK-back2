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

  @IsString()
  @MinLength(8, { message: 'password must be at least 8 characters' })
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

  @IsString()
  @Length(4, 6)
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
