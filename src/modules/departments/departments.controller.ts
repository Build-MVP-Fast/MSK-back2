import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { companyScope } from '../../common/util/company-scope';

import { DepartmentsService } from './departments.service';

@ApiTags('departments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly service: DepartmentsService) {}

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER, UserRole.RECEPTIONIST)
  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query('companyId') companyId?: string) {
    return this.service.list(companyScope(user, companyId));
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER, UserRole.RECEPTIONIST)
  @Get(':id')
  detail(@Param('id') id: string) {
    return this.service.detail(id);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Post()
  create(@Body() dto: any, @CurrentUser() user: AuthenticatedUser) {
    const companyId = dto?.companyId ?? user.companyId;
    if (!companyId) {
      throw new BadRequestException(
        'companyId is required — your account is not linked to a company yet.',
      );
    }
    return this.service.create({ ...dto, companyId });
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: any) {
    return this.service.update(id, dto);
  }

  @Roles(UserRole.SUPER_USER)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Post(':id/members/:userId')
  addMember(
    @Param('id') departmentId: string,
    @Param('userId') userId: string,
    @Body() body: { positionTitle?: string; isHead?: boolean },
  ) {
    return this.service.addMember(departmentId, userId, body.positionTitle, body.isHead);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Delete(':id/members/:userId')
  removeMember(@Param('id') departmentId: string, @Param('userId') userId: string) {
    return this.service.removeMember(departmentId, userId);
  }
}
