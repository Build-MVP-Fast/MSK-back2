import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

import { UpsertPropertyContentDto } from './dto/upsert-property-content.dto';
import { PropertyContentService } from './property-content.service';

@ApiTags('property-content')
@Controller('property-content')
export class PropertyContentController {
  constructor(private readonly service: PropertyContentService) {}

  // ── Public read (website) ─────────────────────────────────────────────
  @Public()
  @Get('public')
  publicAll() {
    return this.service.publicAll();
  }

  // ── Admin ─────────────────────────────────────────────────────────────
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Get()
  listAll() {
    return this.service.listAll();
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Get(':slug')
  getBySlug(@Param('slug') slug: string) {
    return this.service.getBySlug(slug);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Put(':slug')
  upsert(
    @Param('slug') slug: string,
    @Body() dto: UpsertPropertyContentDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.upsert(slug, dto, userId);
  }
}
