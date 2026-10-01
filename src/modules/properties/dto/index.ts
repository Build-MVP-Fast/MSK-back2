import { PropertyStatus } from '@prisma/client';
import { IntersectionType } from '@nestjs/swagger';
import {
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

import { PaginationDto } from '../../../common/dto/pagination.dto';

export class CreatePropertyDto {
  /** Optional — when omitted the controller defaults this from the
   *  authenticated user's companyId. */
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  shortDescription?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  addressLine1?: string;

  @IsOptional()
  @IsString()
  addressLine2?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  postalCode?: string;

  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  defaultCurrency?: string;

  @IsOptional()
  @IsString()
  checkInTime?: string;

  @IsOptional()
  @IsString()
  checkOutTime?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdatePropertyDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  shortDescription?: string;

  @IsOptional()
  @IsEnum(PropertyStatus)
  status?: PropertyStatus;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  checkInTime?: string;

  @IsOptional()
  @IsString()
  checkOutTime?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class PropertyFilterDto {
  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  q?: string;
}

// Combined DTO so a single @Query() binding accepts both filter and pagination
// fields. With the global `forbidNonWhitelisted: true` pipe, splitting these
// across two @Query() DTOs causes each to reject the other's params.
export class PropertyListQueryDto extends IntersectionType(
  PropertyFilterDto,
  PaginationDto,
) {}

// Admin list query — adds an optional status filter on top of pagination so
// the dashboard can scope to Published / Draft / Archived (or omit for "All").
export class AdminPropertyFilterDto {
  @IsOptional()
  @IsEnum(PropertyStatus)
  status?: PropertyStatus;
}

export class AdminPropertyListQueryDto extends IntersectionType(
  AdminPropertyFilterDto,
  PaginationDto,
) {}
