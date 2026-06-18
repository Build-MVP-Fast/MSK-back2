import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BookingsService } from '../bookings/bookings.service';

import { RequestInvoiceDto } from './dto/request-invoice.dto';
import { InvoicesService } from './invoices.service';

@ApiTags('invoices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('invoices')
export class InvoicesController {
  constructor(
    private readonly service: InvoicesService,
    private readonly bookings: BookingsService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Guest-initiated invoice request from the mobile InvoiceRequest
   * screen. The current stay supplies the bookingId + amount; the
   * client picks scope and (for company / someone-else) the recipient
   * name + email. We create a DRAFT row that the accounts team
   * finalises from the admin side.
   */
  @Roles(UserRole.WEB_GUEST, UserRole.ADMIN, UserRole.SUPER_USER)
  @Post('request')
  async requestInvoice(
    @Body() dto: RequestInvoiceDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('email') email: string | null,
    @CurrentUser('phone') phone: string | null,
  ) {
    const stay = await this.bookings.currentStay(userId, email);
    if (!stay) {
      throw new NotFoundException('No active booking to attach an invoice to.');
    }
    const recipientName =
      dto.scope === 'self' ? (await this.lookupOwnName(userId)) : dto.recipientName;
    const recipientEmail = dto.scope === 'self' ? email ?? undefined : dto.recipientEmail;
    if (dto.scope !== 'self' && (!recipientName || !recipientEmail)) {
      throw new BadRequestException(
        'Recipient name and email are required for company or third-party invoices.',
      );
    }
    return this.service.request({
      userId,
      bookingId: stay.id,
      recipientName: recipientName ?? undefined,
      recipientEmail: recipientEmail ?? undefined,
      notes: dto.notes,
      amount: stay.outstandingAmount > 0 ? stay.outstandingAmount : stay.totalAmount,
      currency: stay.currency,
    });
  }

  private async lookupOwnName(userId: string): Promise<string | undefined> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { fullName: true, firstName: true, lastName: true },
    });
    if (!u) return undefined;
    return u.fullName ?? (`${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || undefined);
  }

  @Roles(UserRole.WEB_GUEST, UserRole.ADMIN, UserRole.SUPER_USER, UserRole.RECEPTIONIST)
  @Get()
  list(@CurrentUser('id') userId: string, @CurrentUser('role') role: UserRole) {
    return role === UserRole.WEB_GUEST
      ? this.service.list(userId)
      : this.service.list();
  }

  @Roles(UserRole.WEB_GUEST, UserRole.ADMIN, UserRole.SUPER_USER, UserRole.RECEPTIONIST)
  @Get(':id')
  detail(@Param('id') id: string) {
    return this.service.detail(id);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_USER, UserRole.RECEPTIONIST)
  @Post()
  create(@Body() dto: any, @CurrentUser('id') userId: string) {
    return this.service.create({ ...dto, issuedById: userId });
  }

  // ── Supplier-facing routes ───────────────────────────────────────
  // Suppliers see invoices they've issued and can raise new ones
  // against a delivered order. The new invoice goes into DRAFT until
  // the admin accounts team finalises it.

  @Roles(UserRole.SUPPLIER)
  @Get('supplier/mine')
  myInvoices(@CurrentUser('id') userId: string) {
    return this.service.listByIssuer(userId);
  }

  @Roles(UserRole.SUPPLIER)
  @Post('supplier')
  createForSupplier(
    @Body() dto: {
      recipientName?: string;
      recipientEmail?: string;
      recipientAddress?: string;
      items: { description: string; quantity: number; unitPrice: number }[];
      currency?: string;
      notes?: string;
      orderId?: string;
    },
    @CurrentUser('id') userId: string,
  ) {
    return this.service.createSupplierInvoice(userId, dto);
  }
}
