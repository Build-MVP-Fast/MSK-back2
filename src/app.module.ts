import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AppController } from './app.controller';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PrismaModule } from './common/prisma/prisma.module';
import configuration from './config/configuration';

// Auth & identity
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { AccessControlModule } from './modules/access-control/access-control.module';

// Org
import { CompaniesModule } from './modules/companies/companies.module';
import { DepartmentsModule } from './modules/departments/departments.module';
import { WizardsModule } from './modules/wizards/wizards.module';

// PMS domain
import { PropertiesModule } from './modules/properties/properties.module';
import { RoomsModule } from './modules/rooms/rooms.module';
import { AmenitiesModule } from './modules/amenities/amenities.module';
import { PhotosModule } from './modules/photos/photos.module';
import { AvailabilityModule } from './modules/availability/availability.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { InvoicesModule } from './modules/invoices/invoices.module';

// Operations
import { InventoryModule } from './modules/inventory/inventory.module';
import { OrdersModule } from './modules/orders/orders.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { ScheduleModule as StaffScheduleModule } from './modules/schedule/schedule.module';
import { RequestsModule } from './modules/requests/requests.module';

// Communication
import { ChatsModule } from './modules/chats/chats.module';
import { NotificationsModule } from './modules/notifications/notifications.module';

// Location & access
import { GeofencingModule } from './modules/geofencing/geofencing.module';
import { QrCodesModule } from './modules/qr-codes/qr-codes.module';

// Content / feedback
import { ReviewsModule } from './modules/reviews/reviews.module';
import { HandbookModule } from './modules/handbook/handbook.module';
import { RulesModule } from './modules/rules/rules.module';

// Finance
import { FinanceModule } from './modules/finance/finance.module';

// Website-specific
import { CareersModule } from './modules/careers/careers.module';
import { InquiriesModule } from './modules/inquiries/inquiries.module';
import { PublicModule } from './modules/public/public.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      cache: true,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: parseInt(process.env.THROTTLE_TTL ?? '60', 10) * 1000,
        limit: parseInt(process.env.THROTTLE_LIMIT ?? '100', 10),
      },
    ]),
    ScheduleModule.forRoot(),
    PrismaModule,

    // Auth & identity
    AuthModule,
    UsersModule,
    AccessControlModule,

    // Org
    CompaniesModule,
    DepartmentsModule,
    WizardsModule,

    // PMS
    PropertiesModule,
    RoomsModule,
    AmenitiesModule,
    PhotosModule,
    AvailabilityModule,
    BookingsModule,
    PaymentsModule,
    InvoicesModule,

    // Operations
    InventoryModule,
    OrdersModule,
    TasksModule,
    StaffScheduleModule,
    RequestsModule,

    // Communication
    ChatsModule,
    NotificationsModule,

    // Location & access
    GeofencingModule,
    QrCodesModule,

    // Content / feedback
    ReviewsModule,
    HandbookModule,
    RulesModule,

    // Finance
    FinanceModule,

    // Website-specific
    CareersModule,
    InquiriesModule,
    PublicModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
