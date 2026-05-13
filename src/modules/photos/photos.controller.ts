import {
  Body,
  Controller,
  Delete,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

import { UpdatePropertyPhotoDto } from './dto';
import { PhotosService } from './photos.service';

@ApiTags('photos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('photos')
export class PhotosController {
  constructor(private readonly service: PhotosService) {}

  /**
   * Generic CMS upload — used by the admin's content pages for testimonial
   * photos, expansion-city imagery, and site-content IMAGE_URL fields. The
   * returned URL is written to wherever the caller stores it (no DB row
   * is created by this endpoint).
   */
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  @Post('cms')
  uploadCms(@UploadedFile() file: Express.Multer.File) {
    return this.service.uploadCmsImage(file);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  @Post('property/:propertyId')
  uploadProperty(
    @Param('propertyId') propertyId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.service.uploadForProperty(propertyId, file);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  @Post('room-type/:roomTypeId')
  uploadRoomType(
    @Param('roomTypeId') roomTypeId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.service.uploadForRoomType(roomTypeId, file);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Patch('property/:id')
  updateProperty(@Param('id') id: string, @Body() dto: UpdatePropertyPhotoDto) {
    return this.service.updatePropertyPhoto(id, dto);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Delete('property/:id')
  removeProperty(@Param('id') id: string) {
    return this.service.removePropertyPhoto(id);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Patch('room/:id')
  updateRoom(@Param('id') id: string, @Body() dto: UpdatePropertyPhotoDto) {
    return this.service.updateRoomPhoto(id, dto);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Delete('room/:id')
  removeRoom(@Param('id') id: string) {
    return this.service.removeRoomPhoto(id);
  }
}
