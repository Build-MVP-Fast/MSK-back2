import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import sharp from 'sharp';

import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from './storage.service';

interface UpdatePropertyPhotoDto {
  ordering?: number;
  isCover?: boolean;
  caption?: string;
}

@Injectable()
export class PhotosService {
  private readonly logger = new Logger(PhotosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Uploads a photo, generates a thumbnail, persists the row, and — if the
   * property has no cover yet — promotes this photo to be the cover. The DB
   * write happens in a transaction so cover assignment is consistent under
   * concurrent uploads.
   */
  async uploadForProperty(
    propertyId: string,
    file: Express.Multer.File,
    opts: { caption?: string; isCover?: boolean } = {},
  ) {
    const { full, thumb } = await this.processImage(file.buffer);
    const fullObj = await this.storage.upload(
      full,
      'image/webp',
      `properties/${propertyId}`,
    );
    const thumbObj = await this.storage.upload(
      thumb,
      'image/webp',
      `properties/${propertyId}/thumb`,
    );

    return this.prisma.$transaction(async (tx) => {
      const existingCover = await tx.propertyPhoto.findFirst({
        where: { propertyId, isCover: true },
        select: { id: true },
      });
      const isCover = opts.isCover ?? !existingCover;

      return tx.propertyPhoto.create({
        data: {
          propertyId,
          url: fullObj.url,
          thumbUrl: thumbObj.url,
          storageKey: fullObj.key,
          caption: opts.caption,
          isCover,
        },
      });
    });
  }

  async uploadForRoomType(
    roomTypeId: string,
    file: Express.Multer.File,
    opts: { caption?: string; isCover?: boolean } = {},
  ) {
    const { full, thumb } = await this.processImage(file.buffer);
    const fullObj = await this.storage.upload(
      full,
      'image/webp',
      `room-types/${roomTypeId}`,
    );
    const thumbObj = await this.storage.upload(
      thumb,
      'image/webp',
      `room-types/${roomTypeId}/thumb`,
    );

    return this.prisma.$transaction(async (tx) => {
      const existingCover = await tx.roomPhoto.findFirst({
        where: { roomTypeId, isCover: true },
        select: { id: true },
      });
      const isCover = opts.isCover ?? !existingCover;

      return tx.roomPhoto.create({
        data: {
          roomTypeId,
          url: fullObj.url,
          thumbUrl: thumbObj.url,
          storageKey: fullObj.key,
          caption: opts.caption,
          isCover,
        },
      });
    });
  }

  async updatePropertyPhoto(id: string, dto: UpdatePropertyPhotoDto) {
    const photo = await this.prisma.propertyPhoto.findUnique({ where: { id } });
    if (!photo) throw new NotFoundException('Photo not found');

    // If we're promoting this photo to cover, demote any other cover for the
    // same property in the same transaction so there's exactly one cover.
    if (dto.isCover === true) {
      return this.prisma.$transaction(async (tx) => {
        await tx.propertyPhoto.updateMany({
          where: { propertyId: photo.propertyId, isCover: true, NOT: { id } },
          data: { isCover: false },
        });
        return tx.propertyPhoto.update({
          where: { id },
          data: {
            isCover: true,
            ordering: dto.ordering,
            caption: dto.caption,
          },
        });
      });
    }

    return this.prisma.propertyPhoto.update({
      where: { id },
      data: {
        isCover: dto.isCover,
        ordering: dto.ordering,
        caption: dto.caption,
      },
    });
  }

  async updateRoomPhoto(id: string, dto: UpdatePropertyPhotoDto) {
    const photo = await this.prisma.roomPhoto.findUnique({ where: { id } });
    if (!photo) throw new NotFoundException('Photo not found');

    // Same cover-swap pattern as updatePropertyPhoto: a room type can have at
    // most one cover photo. roomTypeId is nullable on the schema, so only
    // demote others when this row actually has one.
    if (dto.isCover === true) {
      return this.prisma.$transaction(async (tx) => {
        if (photo.roomTypeId) {
          await tx.roomPhoto.updateMany({
            where: { roomTypeId: photo.roomTypeId, isCover: true, NOT: { id } },
            data: { isCover: false },
          });
        }
        return tx.roomPhoto.update({
          where: { id },
          data: {
            isCover: true,
            ordering: dto.ordering,
            caption: dto.caption,
          },
        });
      });
    }

    return this.prisma.roomPhoto.update({
      where: { id },
      data: {
        isCover: dto.isCover,
        ordering: dto.ordering,
        caption: dto.caption,
      },
    });
  }

  async removePropertyPhoto(id: string) {
    const photo = await this.prisma.propertyPhoto.findUnique({ where: { id } });
    if (!photo) throw new NotFoundException('Photo not found');

    if (photo.storageKey) {
      try {
        await this.storage.delete(photo.storageKey);
      } catch (err) {
        // Don't block the row deletion on storage hiccups — a missing object
        // is harmless and an outage shouldn't leave us with a stale row.
        this.logger.warn(
          `Failed to delete object ${photo.storageKey} from storage: ${err}`,
        );
      }
    }

    return this.prisma.propertyPhoto.delete({ where: { id } });
  }

  async removeRoomPhoto(id: string) {
    const photo = await this.prisma.roomPhoto.findUnique({ where: { id } });
    if (!photo) throw new NotFoundException('Photo not found');

    if (photo.storageKey) {
      try {
        await this.storage.delete(photo.storageKey);
      } catch (err) {
        this.logger.warn(
          `Failed to delete object ${photo.storageKey} from storage: ${err}`,
        );
      }
    }

    return this.prisma.roomPhoto.delete({ where: { id } });
  }

  private async processImage(buffer: Buffer) {
    const full = await sharp(buffer)
      .resize({ width: 1920, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
    const thumb = await sharp(buffer)
      .resize({ width: 480, withoutEnlargement: true })
      .webp({ quality: 70 })
      .toBuffer();
    return { full, thumb };
  }
}
