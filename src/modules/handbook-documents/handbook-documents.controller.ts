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

import {
  CreateHandbookDocumentDto,
  UpdateHandbookDocumentDto,
} from './handbook-documents.dto';
import { HandbookDocumentsService } from './handbook-documents.service';

@ApiTags('handbook-documents')
@Controller('handbook-documents')
export class HandbookDocumentsController {
  constructor(private readonly service: HandbookDocumentsService) {}

  /** Published documents for a property — consumed by the mobile app. */
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
  create(
    @Body() dto: CreateHandbookDocumentDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.create(dto, userId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateHandbookDocumentDto,
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
