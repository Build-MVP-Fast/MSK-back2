import { BookingSource, BookingStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateBookingDto {
  @IsUUID()
  propertyId!: string;

  @IsUUID()
  roomTypeId!: string;

  /** Inclusive nightly check-in date (YYYY-MM-DD). */
  @IsDateString()
  checkIn!: string;

  /** Exclusive checkout date (YYYY-MM-DD). */
  @IsDateString()
  checkOut!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  adults!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  children?: number;

  @IsEmail()
  guestEmail!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  guestFirstName!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  guestLastName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  guestPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  specialRequests?: string;

  /**
   * Source is set on the server side by the controller (WEBSITE on the
   * public route, ADMIN on the authed route). Accepting it here would let
   * the client misreport bookings; we ignore it on the public endpoint.
   */
  @IsOptional()
  @IsEnum(BookingSource)
  source?: BookingSource;
}

export class CancelBookingDto {
  @IsOptional()
  @IsString()
  @MaxLength(280)
  reason?: string;
}

/**
 * Admin list query — all filters optional, pagination cap matches the
 * properties list.
 */
export class ListBookingsQueryDto {
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;

  @IsOptional()
  @IsUUID()
  propertyId?: string;

  @IsOptional()
  @IsEnum(BookingSource)
  source?: BookingSource;

  /** Match against checkIn within this window. */
  @IsOptional()
  @IsDateString()
  checkInFrom?: string;

  @IsOptional()
  @IsDateString()
  checkInTo?: string;

  /** Substring match against guest name / email / reference. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;
}
