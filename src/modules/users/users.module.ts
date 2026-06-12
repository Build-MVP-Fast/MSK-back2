import { Module } from '@nestjs/common';

import { NotificationsModule } from '../notifications/notifications.module';
import { PhotosModule } from '../photos/photos.module';

import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [NotificationsModule, PhotosModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
