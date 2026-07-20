import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateHandbookDocumentDto {
  @IsUUID()
  propertyId!: string;

  @IsString()
  @MaxLength(200)
  name!: string;

  /** URL returned by POST /uploads (folder = "handbook"). */
  @IsString()
  fileUrl!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  fileType?: string;

  @IsOptional()
  @IsInt()
  fileSize?: number;

  @IsOptional()
  @IsInt()
  ordering?: number;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}

export class UpdateHandbookDocumentDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  fileUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  fileType?: string;

  @IsOptional()
  @IsInt()
  fileSize?: number;

  @IsOptional()
  @IsInt()
  ordering?: number;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}
