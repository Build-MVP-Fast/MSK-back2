import { AvailabilityBlockReason } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CalendarEntryUpsertDto {
  @IsUUID()
  roomTypeId!: string;

  /** ISO date (YYYY-MM-DD). Time portion is ignored — entries are per-day. */
  @IsDateString()
  date!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  inventory?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @IsBoolean()
  closeOut?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  minStay?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxStay?: number;
}

export class BulkUpsertCalendarDto {
  @IsUUID()
  propertyId!: string;

  // Cap the bulk size so a runaway range can't lock the DB. A month of
  // entries for a handful of room types stays well under this.
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => CalendarEntryUpsertDto)
  entries!: CalendarEntryUpsertDto[];
}

export class CreateAvailabilityBlockDto {
  @IsUUID()
  propertyId!: string;

  /** Optional — when omitted, the block applies to the whole property. */
  @IsOptional()
  @IsUUID()
  roomId?: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsEnum(AvailabilityBlockReason)
  reason!: AvailabilityBlockReason;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  notes?: string;
}

export class ListBlocksQueryDto {
  @IsUUID()
  propertyId!: string;

  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;
}

export class PublicAvailabilityQueryDto {
  @IsUUID()
  propertyId!: string;

  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;
}
