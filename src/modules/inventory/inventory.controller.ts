import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { companyScope } from '../../common/util/company-scope';

import { InventoryService } from './inventory.service';

@ApiTags('inventory')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly service: InventoryService) {}

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Get('items')
  listItems(@Query() q: any, @CurrentUser() user: AuthenticatedUser) {
    return this.service.listItems({ ...q, companyId: companyScope(user, q?.companyId) });
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Get('items/:id')
  itemDetail(@Param('id') id: string) {
    return this.service.itemDetail(id);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Post('items')
  createItem(@Body() dto: any, @CurrentUser() user: AuthenticatedUser) {
    // Stamp companyId from the caller so an ADMIN's items are
    // scoped to their tenant. SUPER_USER may pass companyId in the body.
    const callerCompanyId =
      user.role === UserRole.ADMIN ? user.companyId ?? undefined : dto.companyId;
    return this.service.createItem(dto, callerCompanyId);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Patch('items/:id')
  updateItem(@Param('id') id: string, @Body() dto: any) {
    return this.service.updateItem(id, dto);
  }

  @Roles(UserRole.SUPER_USER)
  @Delete('items/:id')
  removeItem(@Param('id') id: string) {
    return this.service.removeItem(id);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Post('movements')
  recordMovement(@Body() dto: any) {
    return this.service.recordMovement(dto);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER, UserRole.RECEPTIONIST)
  @Post('allocations')
  allocate(@Body() dto: any) {
    return this.service.allocate(dto);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER, UserRole.RECEPTIONIST)
  @Post('allocations/:id/return')
  returnAllocation(@Param('id') id: string) {
    return this.service.returnAllocation(id);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER, UserRole.RECEPTIONIST)
  @Get('allocations')
  listAllocations(@Query() q: any) {
    return this.service.listAllocations(q);
  }
}
