import {
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpsertPropertyContentDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() tagline?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() heroImage?: string;

  /** Gallery image URLs. */
  @IsOptional() @IsArray() images?: string[];

  /** Per-room overrides keyed by Mews room-category id. */
  @IsOptional()
  @IsObject()
  rooms?: Record<string, { images: string[]; description?: string }>;

  @IsOptional() @IsInt() ordering?: number;
  @IsOptional() @IsBoolean() isPublished?: boolean;
}
