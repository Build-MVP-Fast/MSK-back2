import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { StorageService } from '../photos/storage.service';

const ALLOWED_FOLDERS = new Set([
  'task-proofs',
  'supplier-logos',
  'company-logos',
  'avatars',
  'property-content',
  'misc',
]);

@ApiTags('uploads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('uploads')
export class UploadsController {
  constructor(private readonly storage: StorageService) {}

  /**
   * Generic file upload used by mobile screens that don't need a
   * domain-specific route: task proof-of-work photos, supplier logos,
   * company logos, etc.
   *
   * The caller picks a `folder` from a small allowlist so we don't end
   * up with random buckets, but the file itself is just streamed
   * straight to storage (Supabase Storage S3-compatible bucket via the
   * existing StorageService — no code change needed there).
   */
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024 } }),
  )
  @Post()
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body('folder') folder?: string,
  ) {
    if (!file) throw new BadRequestException('file is required');
    const safeFolder = folder && ALLOWED_FOLDERS.has(folder) ? folder : 'misc';
    const { url, key } = await this.storage.upload(
      file.buffer,
      file.mimetype || 'application/octet-stream',
      safeFolder,
    );
    return { url, key };
  }
}
