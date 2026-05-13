import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateHouseRuleDto {
  @IsString()
  category!: string;

  @IsString()
  title!: string;

  @IsString()
  description!: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  ordering?: number;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}

export class UpdateHouseRuleDto {
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  icon?: string;

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
