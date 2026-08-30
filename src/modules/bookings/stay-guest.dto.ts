import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Body for POST /bookings/me/current-stay/guests — a guest adding an
 * additional occupant to their own current stay from the profile screen.
 * Mirrors the BookingGuest columns the Additional Guests screen renders.
 */
export class AddStayGuestDto {
  @IsString()
  @MaxLength(120)
  fullName!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  kidsCount?: number;

  @IsOptional()
  @IsString()
  bookingId?: string;
}

export class InviteStayGuestsDto {
  @IsArray()
  @ArrayMaxSize(10)
  @IsEmail({}, { each: true })
  emails!: string[];

  @IsOptional()
  @IsString()
  bookingId?: string;
}

export class ClaimReservationDto {
  @IsString()
  @MinLength(3)
  reference!: string;
}
