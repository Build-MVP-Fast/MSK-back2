import { Body, Controller, ForbiddenException, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { OrderStatus, UserRole } from '@prisma/client';

import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { companyScope } from '../../common/util/company-scope';

import { OrdersService } from './orders.service';

@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly service: OrdersService) {}

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Get()
  list(@Query() q: { status?: OrderStatus; companyId?: string }, @CurrentUser() user: AuthenticatedUser) {
    return this.service.list({ ...q, companyId: companyScope(user, q?.companyId) });
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER, UserRole.SUPPLIER)
  @Get(':id')
  async detail(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const order = await this.service.detail(id);
    // Suppliers can only fetch orders bound to their own
    // SupplierProfile. Defence against IDOR — without it any
    // supplier could read any order by guessing the UUID.
    if (user.role === UserRole.SUPPLIER) {
      const ok = await this.service.isOrderForSupplierUser(order.id, user.id);
      if (!ok) {
        throw new ForbiddenException('Not your order');
      }
    }
    return order;
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Post()
  create(@Body() dto: any, @CurrentUser('id') userId: string) {
    return this.service.create({ ...dto, createdById: userId });
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER, UserRole.SUPPLIER)
  @Post(':id/status')
  setStatus(@Param('id') id: string, @Body() body: { status: OrderStatus }) {
    return this.service.setStatus(id, body.status);
  }

  // ── Supplier-facing routes ───────────────────────────────────────
  // Suppliers see only their own orders. Lookup goes via the
  // current user's SupplierProfile id.

  @Roles(UserRole.SUPPLIER)
  @Get('supplier/mine')
  mine(
    @CurrentUser('id') userId: string,
    @Query('status') status?: OrderStatus,
  ) {
    return this.service.listForSupplierUser(userId, status);
  }

  // Records dispatch info (carrier, tracking number, optional notes)
  // into Order.metadata and moves status to IN_TRANSIT. Multipart not
  // needed — the supplier picks method client-side and only sends text.
  @Roles(UserRole.SUPPLIER, UserRole.ADMIN, UserRole.SUPER_USER)
  @Post(':id/dispatch')
  dispatch(
    @Param('id') id: string,
    @Body() body: { method?: string; trackingNumber?: string; carrier?: string; notes?: string },
  ) {
    return this.service.dispatch(id, body);
  }
}
