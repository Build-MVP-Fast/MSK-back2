import { Module } from '@nestjs/common';

import { PhotosModule } from '../photos/photos.module';

import { CareersController } from './careers.controller';
import { CareersService } from './careers.service';
import { JobApplicationsController } from './job-applications.controller';

@Module({
  // PhotosModule exports StorageService — reused for CV uploads so we
  // don't end up with two paths to R2.
  imports: [PhotosModule],
  controllers: [CareersController, JobApplicationsController],
  providers: [CareersService],
  exports: [CareersService],
})
export class CareersModule {}
