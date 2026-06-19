import { Module } from '@nestjs/common';

import { PhotosModule } from '../photos/photos.module';

import { UploadsController } from './uploads.controller';

/**
 * Tiny module that exposes the generic POST /uploads endpoint. Reuses
 * the StorageService exported by PhotosModule so the same S3
 * (or Supabase) bucket configuration is used everywhere.
 */
@Module({
  imports: [PhotosModule],
  controllers: [UploadsController],
})
export class UploadsModule {}
