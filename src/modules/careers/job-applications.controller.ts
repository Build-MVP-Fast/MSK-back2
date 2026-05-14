import {
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

import { Public } from '../../common/decorators/public.decorator';

import { CareersService } from './careers.service';

// DTO declared before the controller because NestJS uses it at class
// decoration time (@Body() reflects on the parameter type) — declaring
// it after the controller throws ReferenceError at module load on
// runtimes that don't hoist class bodies.
class SubmitJobApplicationDto {
  @IsUUID()
  jobPostingId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  firstName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  lastName!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  coverLetter?: string;
}

/**
 * Public multipart job application endpoint used by msk-web's apply
 * modal. Kept on its own controller so the URL is /job-applications
 * (per spec) rather than nested under /careers/jobs/:jobId/apply.
 *
 * The careers controller still exposes the existing JSON apply route
 * for back-compat with the mobile app; this is the new path that
 * accepts the CV upload.
 */
@ApiTags('job-applications')
@Controller('job-applications')
export class JobApplicationsController {
  constructor(private readonly careers: CareersService) {}

  @Public()
  @Post()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('cv'))
  async submit(
    @Body() dto: SubmitJobApplicationDto,
    @UploadedFile() cv: Express.Multer.File,
  ) {
    return this.careers.applyWithCv({
      jobPostingId: dto.jobPostingId,
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      phone: dto.phone,
      coverLetter: dto.coverLetter,
      cv,
    });
  }
}
