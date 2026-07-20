import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateTermsDto {
  @IsUUID()
  propertyId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  /** Rich HTML body. */
  @IsOptional()
  @IsString()
  body?: string;

  /** false = draft (default), true = published/visible to guests. */
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @IsOptional()
  @IsInt()
  ordering?: number;
}

export class UpdateTermsDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @IsOptional()
  @IsInt()
  ordering?: number;
}
