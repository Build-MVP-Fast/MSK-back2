import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  MinLength,
  ValidateIf,
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

/** POST /bookings/public/check-out/lookup */
export class CheckOutLookupDto {
  @IsString()
  @MinLength(3)
  reference!: string;
}

/** POST /bookings/public/check-out/submit */
export class CheckOutSubmitDto {
  @IsString()
  bookingId!: string;

  @IsIn(['REMOTE', 'RECEPTION'])
  checkoutMethod!: 'REMOTE' | 'RECEPTION';

  @IsOptional()
  @IsIn(['PROPERTY', 'CARD', 'BANK_TRANSFER'])
  paymentMethod?: 'PROPERTY' | 'CARD' | 'BANK_TRANSFER';

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  roomPhotoUrls?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  bathroomPhotoUrls?: string[];

  @IsOptional()
  @IsIn(['STAFF', 'ROOM'])
  keyLocation?: 'STAFF' | 'ROOM';

  @IsOptional()
  @IsString()
  @MaxLength(200)
  staffName?: string;

  @ValidateIf((o: CheckOutSubmitDto) => o.checkoutMethod === 'RECEPTION')
  @IsString()
  @MinLength(1)
  staffQrCode?: string;

  @ValidateIf((o: CheckOutSubmitDto) => o.checkoutMethod === 'REMOTE')
  @IsString()
  @MinLength(1)
  keyLocationPhotoUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  feedback?: string;

  @IsBoolean()
  confirmed!: boolean;
}
