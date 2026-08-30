import { BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
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
    const stay = dto.bookingId
      ? await this.bookings.stayByIdForGuest(userId, email, dto.bookingId)
      : await this.bookings.currentStay(userId, email);
    if (!stay) {
      throw new NotFoundException('No active booking to attach an invoice to.');
    }
    const recipientName =
      dto.scope === 'self' ? (await this.lookupOwnName(userId)) : dto.recipientName;
    const recipientEmail = dto.scope === 'self' ? email ?? undefined : dto.recipientEmail;
    // Email is optional — reception can still issue the invoice with just
    // a name. Only the recipient name is mandatory for company / third-party.
    if (dto.scope !== 'self' && !recipientName) {
      throw new BadRequestException(
        'A recipient name is required for company or third-party invoices.',
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
  list(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: UserRole,
    @CurrentUser('companyId') companyId: string | null,
  ) {
    if (role === UserRole.WEB_GUEST) return this.service.list({ userId });
    if (role === UserRole.SUPER_USER) return this.service.list();
    // ADMIN / RECEPTIONIST — scope to their company so they don't see
    // every supplier invoice on the platform.
    return this.service.list({ operatorCompanyId: companyId ?? undefined });
  }

  @Roles(UserRole.WEB_GUEST, UserRole.ADMIN, UserRole.SUPER_USER, UserRole.RECEPTIONIST, UserRole.SUPPLIER)
  @Get(':id')
  async detail(
    @Param('id') id: string,
    @CurrentUser() caller: AuthenticatedUser,
  ) {
    const invoice = await this.service.detail(id);
    if (caller.role === UserRole.SUPPLIER) {
      // Suppliers can only fetch invoices they raised. issuedById is the
      // User.id of the supplier user who hit POST /invoices/supplier.
      const issuedBy = (invoice as unknown as { issuedById?: string | null }).issuedById ?? null;
      if (issuedBy !== caller.id) {
        throw new ForbiddenException('Not your invoice');
      }
    } else if (caller.role === UserRole.ADMIN || caller.role === UserRole.RECEPTIONIST) {
      // Tenant guard: operator-tier callers only see invoices for
      // orders their own company placed. Without this, operator A
      // could fetch operator B's supplier invoice by guessing the UUID.
      const meta = (invoice as unknown as { metadata?: { operatorCompanyId?: string } | null }).metadata ?? null;
      const invoiceCompany = meta?.operatorCompanyId ?? null;
      if (invoiceCompany && caller.companyId && invoiceCompany !== caller.companyId) {
        throw new ForbiddenException('Not your invoice');
      }
    }
    return invoice;
  }

  /** Supplier marks their own invoice as PAID once the operator
   *  confirms the bank transfer. Same ownership check as detail. */
  @Roles(UserRole.SUPPLIER, UserRole.ADMIN, UserRole.SUPER_USER)
  @Patch(':id/status')
  async setStatus(
    @Param('id') id: string,
    @Body() body: { status: 'PAID' | 'VOIDED' | 'ISSUED' },
    @CurrentUser() caller: AuthenticatedUser,
  ) {
    if (caller.role === UserRole.SUPPLIER) {
      const invoice = await this.service.detail(id);
      const issuedBy = (invoice as unknown as { issuedById?: string | null }).issuedById ?? null;
      if (issuedBy !== caller.id) {
        throw new ForbiddenException('Not your invoice');
      }
    } else if (caller.role === UserRole.ADMIN) {
      // Tenant guard: operator can only mark invoices for orders
      // their own company placed.
      const invoice = await this.service.detail(id);
      const meta = (invoice as unknown as { metadata?: { operatorCompanyId?: string } | null }).metadata ?? null;
      const invoiceCompany = meta?.operatorCompanyId ?? null;
      if (invoiceCompany && caller.companyId && invoiceCompany !== caller.companyId) {
        throw new ForbiddenException('Not your invoice');
      }
    }
    return this.service.setStatus(id, body.status);
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
