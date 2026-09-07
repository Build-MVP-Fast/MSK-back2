import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { companyScope } from '../../common/util/company-scope';
import { SuppliersService } from './suppliers.service';

@ApiTags('suppliers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly service: SuppliersService) {}

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    const companyId = companyScope(user, undefined);
    return this.service.list(companyId!);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.get(id, companyScope(user, undefined)!);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Post()
  create(@Body() dto: any, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(companyScope(user, undefined)!, dto);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: any, @CurrentUser() user: AuthenticatedUser) {
    return this.service.update(id, companyScope(user, undefined)!, dto);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remove(id, companyScope(user, undefined)!);
  }
}
