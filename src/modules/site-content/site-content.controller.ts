import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

import { UpdateSiteContentDto } from './dto/update-site-content.dto';
import { SiteContentService } from './site-content.service';

@ApiTags('site-content')
@Controller('site-content')
export class SiteContentController {
  constructor(private readonly service: SiteContentService) {}

  // ── Public reads ──────────────────────────────────────────────────────

  @Public()
  @Get('public')
  publicAll() {
    return this.service.publicAll();
  }

  @Public()
  @Get('public/by-group/:group')
  publicByGroup(@Param('group') group: string) {
    return this.service.publicByGroup(group);
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
  @Patch(':key')
  update(
    @Param('key') key: string,
    @Body() dto: UpdateSiteContentDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.update(key, dto.value, userId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @HttpCode(HttpStatus.OK)
  @Post('seed')
  seed(@CurrentUser('id') userId: string) {
    return this.service.runSeed(userId);
  }
}
