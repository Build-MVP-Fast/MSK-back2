import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { Public } from '../../common/decorators/public.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

import {
  BulkUpsertCalendarDto,
  CreateAvailabilityBlockDto,
  ListBlocksQueryDto,
  PublicAvailabilityQueryDto,
} from './dto';
import { AvailabilityService } from './availability.service';

@ApiTags('availability')
@Controller('availability')
export class AvailabilityController {
  constructor(private readonly service: AvailabilityService) {}

  // ── Admin: detailed calendar (existing) ────────────────────────────────

  @Public()
  @Get('calendar')
  calendar(
    @Query('propertyId') propertyId: string,
    @Query('roomTypeId') roomTypeId: string,
    @Query('roomId') roomId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.service.getCalendar({
      propertyId,
      roomTypeId,
      roomId,
      from: new Date(from),
      to: new Date(to),
    });
  }

  // ── Admin: bulk upsert inventory + price across days ───────────────────

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @RequirePermission('availability.update')
  @Patch('calendar')
  bulkUpsertCalendar(@Body() dto: BulkUpsertCalendarDto) {
    return this.service.bulkUpsertCalendar(
      dto.propertyId,
      dto.entries.map((e) => ({
        roomTypeId: e.roomTypeId,
        date: new Date(e.date),
        inventory: e.inventory,
        price: e.price,
        currency: e.currency,
        closeOut: e.closeOut,
        minStay: e.minStay,
        maxStay: e.maxStay,
      })),
    );
  }

  // ── Admin: block dates (create / list / delete) ────────────────────────

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER, UserRole.RECEPTIONIST)
  @RequirePermission('availability.update')
  @Post('block')
  block(@Body() dto: CreateAvailabilityBlockDto) {
    return this.service.blockDates({
      propertyId: dto.propertyId,
      roomId: dto.roomId,
      startDate: new Date(dto.startDate),
      endDate: new Date(dto.endDate),
      reason: dto.reason,
      notes: dto.notes,
    });
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER, UserRole.RECEPTIONIST)
  @Get('blocks')
  listBlocks(@Query() query: ListBlocksQueryDto) {
    return this.service.listBlocks(
      query.propertyId,
      new Date(query.from),
      new Date(query.to),
    );
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @RequirePermission('availability.update')
  @Delete('blocks/:id')
  removeBlock(@Param('id') id: string) {
    return this.service.unblockDates(id);
  }

  // ── Public: per-day availability + price for the website date picker ───

  @Public()
  @Get('public')
  publicAvailability(@Query() query: PublicAvailabilityQueryDto) {
    return this.service.publicAvailability(
      query.propertyId,
      new Date(query.from),
      new Date(query.to),
    );
  }
}
