import { Module } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PhotosModule } from '../photos/photos.module';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { CheckInTokenGuard } from './check-in-token';

@Module({
  // NotificationsModule exports EmailService for the booking confirmation
  // mail. AvailabilityModule provides tryReserve / release for the
  // concurrency-safe reservation path. AuthModule provides OtpService
  // (reservation-enquiry OTP) plus JwtService (check-in scoped token).
  // PhotosModule exports StorageService for the wizard's signature upload.
  imports: [AvailabilityModule, NotificationsModule, AuthModule, PhotosModule],
  controllers: [BookingsController],
  providers: [BookingsService, CheckInTokenGuard],
  exports: [BookingsService],
})
export class BookingsModule {}
