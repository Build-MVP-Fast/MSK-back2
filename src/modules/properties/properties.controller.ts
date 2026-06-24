import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { companyScope } from '../../common/util/company-scope';
import {
  AdminPropertyListQueryDto,
  CreatePropertyDto,
  PropertyListQueryDto,
  UpdatePropertyDto,
} from './dto';
import { PropertiesService } from './properties.service';

@ApiTags('properties')
@Controller('properties')
export class PropertiesController {
  constructor(private readonly service: PropertiesService) {}

  // ---- Public (website browsing) -----------------------------------------

  @Public()
  @Get('public')
  publicList(@Query() query: PropertyListQueryDto) {
    return this.service.publicList(query, query);
  }

  @Public()
  @Get('public/:slug')
  publicDetail(@Param('slug') slug: string) {
    return this.service.publicDetail(slug);
  }

  // ---- Admin / dashboard --------------------------------------------------

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Get()
  list(@Query() query: AdminPropertyListQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.list({ ...query, companyId: companyScope(user) });
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
  create(@Body() dto: CreatePropertyDto, @CurrentUser() user: AuthenticatedUser) {
    const companyId = dto.companyId ?? user.companyId;
    if (!companyId) {
      throw new BadRequestException(
        'companyId is required — your account is not linked to a company yet.',
      );
    }
    return this.service.create({ ...dto, companyId });
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePropertyDto) {
    return this.service.update(id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Post(':id/publish')
  publish(@Param('id') id: string) {
    return this.service.publish(id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Post(':id/archive')
  archive(@Param('id') id: string) {
    return this.service.archive(id);
  }

  // Property Operator (ADMIN) can delete a property in their own
  // tenant; SUPER_USER may delete anywhere. Cross-company protection
  // is enforced in the service.
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() caller: AuthenticatedUser) {
    const scopeCompanyId =
      caller.role === UserRole.ADMIN ? caller.companyId ?? undefined : undefined;
    return this.service.remove(id, scopeCompanyId);
  }
}
