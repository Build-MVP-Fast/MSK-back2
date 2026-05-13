import { IsString } from 'class-validator';

export class UpdateSiteContentDto {
  @IsString()
  value!: string;
}
