import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';

/** POST /bookings/public/check-out/sign-in/credentials */
export class CheckOutSignInCredentialsDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}

/** POST /bookings/public/check-out/sign-in/code */
export class CheckOutSignInCodeDto {
  @IsString()
  @Length(4, 8)
  code!: string;
}

/** POST /bookings/public/check-out/sign-in/otp/request */
export class CheckOutOtpRequestDto {
  @IsEmail()
  email!: string;
}

/** POST /bookings/public/check-out/sign-in/otp/verify */
export class CheckOutOtpVerifyDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(4, 8)
  code!: string;
}

/** POST /bookings/public/check-out/submit */
export class CheckOutSubmitDto {
  @IsString()
  bookingId!: string;

  // Photos are S3 URLs returned by the /check-out/upload-photo endpoint.
  // Room photos are 2–4 per the UI's required range; bathroom is 1+;
  // key-location photo is required only when the guest chose "in the
  // room" — the controller / service enforces that branch separately.
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  roomPhotoUrls!: string[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  bathroomPhotoUrls!: string[];

  @IsIn(['STAFF', 'ROOM'])
  keyLocation!: 'STAFF' | 'ROOM';

  @IsOptional()
  @IsString()
  @MaxLength(200)
  staffName?: string;

  @IsOptional()
  @IsString()
  keyLocationPhotoUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  feedback?: string;

  @IsBoolean()
  confirmed!: boolean;
}
