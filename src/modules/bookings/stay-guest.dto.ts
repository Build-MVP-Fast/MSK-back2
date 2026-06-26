import { IsEmail, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

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
}
