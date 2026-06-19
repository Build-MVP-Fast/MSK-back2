import {
  BadRequestException,
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

import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

import { CreateShiftDto, UpdateShiftDto, isTimeOfDay } from './dto';
import { ShiftsService } from './shifts.service';

@ApiTags('shifts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('shifts')
export class ShiftsController {
  constructor(private readonly service: ShiftsService) {}

  // Any authenticated user can read shift templates so the staff
  // wizard / supervisor team views can show "Morning Shift" etc. as
  // labels even before the operator finishes onboarding.
  @Get()
  list(@Query('companyId') companyId?: string) {
    return this.service.list(companyId);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.service.detail(id);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Post()
  create(@Body() dto: CreateShiftDto) {
    if (!isTimeOfDay(dto.startTime) || !isTimeOfDay(dto.endTime)) {
      throw new BadRequestException('startTime and endTime must be HH:mm');
    }
    return this.service.create(dto);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateShiftDto) {
    if (dto.startTime !== undefined && !isTimeOfDay(dto.startTime)) {
      throw new BadRequestException('startTime must be HH:mm');
    }
    if (dto.endTime !== undefined && !isTimeOfDay(dto.endTime)) {
      throw new BadRequestException('endTime must be HH:mm');
    }
    return this.service.update(id, dto);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
