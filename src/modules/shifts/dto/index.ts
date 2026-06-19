import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateShiftDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @IsString()
  startTime!: string; // validated as HH:mm in the service / controller layer

  @IsString()
  endTime!: string;

  @IsOptional()
  @IsString()
  daysOfWeek?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpdateShiftDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  startTime?: string;

  @IsOptional()
  @IsString()
  endTime?: string;

  @IsOptional()
  @IsString()
  daysOfWeek?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}

export function isTimeOfDay(value: string): boolean {
  return TIME_REGEX.test(value);
}
