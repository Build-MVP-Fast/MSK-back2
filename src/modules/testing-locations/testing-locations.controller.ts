import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
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
  CreateTestingLocationDto,
  UpdateTestingLocationDto,
} from './dto/testing-location.dto';
import { TestingLocationsService } from './testing-locations.service';

@ApiTags('testing-locations')
@Controller('testing-locations')
export class TestingLocationsController {
  constructor(private readonly service: TestingLocationsService) {}

  @Public()
  @Get('public')
  publicList() {
    return this.service.publicList();
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @RequirePermission('content.testing-locations.read')
  @Get()
  list() {
    return this.service.list();
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @RequirePermission('content.testing-locations.create')
  @Post()
  create(@Body() dto: CreateTestingLocationDto) {
    return this.service.create(dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @RequirePermission('content.testing-locations.update')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTestingLocationDto) {
    return this.service.update(id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @RequirePermission('content.testing-locations.delete')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
