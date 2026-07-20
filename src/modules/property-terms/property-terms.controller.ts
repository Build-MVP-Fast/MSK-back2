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

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

import { CreateTermsDto, UpdateTermsDto } from './property-terms.dto';
import { PropertyTermsService } from './property-terms.service';

@ApiTags('property-terms')
@Controller('property-terms')
export class PropertyTermsController {
  constructor(private readonly service: PropertyTermsService) {}

  /** Published terms for a property — consumed by the mobile check-in wizard. */
  @Public()
  @Get('public')
  publicList(@Query('propertyId') propertyId: string) {
    return this.service.listPublished(propertyId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Get()
  list(@Query('propertyId') propertyId: string) {
    return this.service.list(propertyId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Get(':id')
  detail(@Param('id') id: string) {
    return this.service.detail(id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Post()
  create(@Body() dto: CreateTermsDto, @CurrentUser('id') userId: string) {
    return this.service.create(dto, userId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTermsDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.update(id, dto, userId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
