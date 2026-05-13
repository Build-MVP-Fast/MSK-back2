import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateFaqDto {
  @IsString()
  category!: string;

  @IsString()
  question!: string;

  @IsString()
  answer!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  ordering?: number;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}

export class UpdateFaqDto {
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  question?: string;

  @IsOptional()
  @IsString()
  answer?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  ordering?: number;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}

export class ReorderItem {
  @IsString()
  id!: string;

  @IsInt()
  @Min(0)
  ordering!: number;
}
