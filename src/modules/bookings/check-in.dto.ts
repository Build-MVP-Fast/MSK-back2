import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** Body for POST /bookings/public/check-in/lookup */
export class CheckInLookupDto {
  @IsString()
  @MinLength(3)
  reference!: string;
}

/** Body for POST /bookings/public/check-in/start */
export class CheckInStartDto {
  @IsString()
  reference!: string;

  @IsString()
  lastName!: string;
}

/** Body for POST /bookings/public/check-in/verify */
export class CheckInVerifyDto {
  @IsString()
  reference!: string;

  @IsString()
  lastName!: string;

  @IsString()
  @Length(4, 8)
  code!: string;
}

/** Body for POST /bookings/public/check-in/email-code */
export class CheckInEmailCodeDto {
  @IsOptional()
  @IsEmail()
  email?: string;
}

class CheckInGuestDto {
  @IsString()
  firstName!: string;

  @IsString()
  lastName!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsBoolean()
  hasKids?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  kidsCount?: number;
}

/** Body for POST /bookings/public/check-in/submit */
export class CheckInSubmitDto {
  // ── Booker / primary guest details (overrides the booking's stored
  // contact info if the guest corrects a typo during the wizard) ──────
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  /** HH:mm, optional. */
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'arrivalTime must be HH:mm' })
  arrivalTime?: string;

  // ── Room change question (mandatory in the UI; backend allows omission
  // to support partial future use, but the wizard always sends a value) ─
  @IsOptional()
  @IsBoolean()
  wantsRoomTypeChange?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  requestedRoomType?: string;

  // ── Additional guests ────────────────────────────────────────────────
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CheckInGuestDto)
  guests?: CheckInGuestDto[];

  // ── Identity verification choices ────────────────────────────────────
  @IsOptional()
  @IsIn(['NOW', 'LATER'])
  physicalVerifyChoice?: 'NOW' | 'LATER';

  @IsOptional()
  @IsBoolean()
  addressByCode?: boolean;

  @IsOptional()
  @IsIn(['SELF', 'RECEPTION'])
  identityVerifyMethod?: 'SELF' | 'RECEPTION';

  @IsOptional()
  @IsString()
  @MaxLength(40)
  vehicleRegistration?: string;

  @IsOptional()
  @IsString()
  idDocumentUrl?: string;

  @IsOptional()
  @IsString()
  selfieUrl?: string;

  @IsOptional()
  @IsBoolean()
  acceptedPrivacy?: boolean;

  @IsOptional()
  @IsBoolean()
  confirmedAccurate?: boolean;

  @IsOptional()
  @IsBoolean()
  identityConsent?: boolean;

  // ── Signature + final freeform note + terms ──────────────────────────
  @IsOptional()
  @IsString()
  signatureUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  additionalInfoText?: string;

  @IsBoolean()
  acceptedTerms!: boolean;

  // ── On-behalf-of bookings ────────────────────────────────────────────
  // When true, the contact fields above describe the *guest* (occupant)
  // and the booker* fields below describe the *booker* (operator). The
  // backend persists both, links the booking to the booker's User row
  // when known, and sends the confirmation email to both addresses.
  @IsOptional()
  @IsBoolean()
  isBehalfBooking?: boolean;

  @IsOptional()
  @IsString()
  bookerFirstName?: string;

  @IsOptional()
  @IsString()
  bookerLastName?: string;

  @IsOptional()
  @IsEmail()
  bookerEmail?: string;

  @IsOptional()
  @IsString()
  bookerPhone?: string;
}
