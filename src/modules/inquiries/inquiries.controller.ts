import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InquiryStatus, UserRole } from '@prisma/client';

import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

import { InquiriesService } from './inquiries.service';

@ApiTags('inquiries')
@Controller('inquiries')
export class InquiriesController {
  constructor(private readonly service: InquiriesService) {}

  // ---- Public (website forms) --------------------------------------------

  @Public()
  @Post('newsletter')
  subscribe(@Body() dto: { email: string; source?: string }) {
    return this.service.subscribeNewsletter(dto);
  }

  @Public()
  @Post('newsletter/unsubscribe')
  unsubscribe(@Body() dto: { email: string }) {
    return this.service.unsubscribeNewsletter(dto.email);
  }

  @Public()
  @Post('partner')
  createPartner(@Body() dto: any) {
    return this.service.createPartnerInquiry(dto);
  }

  @Public()
  @Post('contact')
  createContact(@Body() dto: any) {
    return this.service.createContactInquiry(dto);
  }

  // ---- Admin --------------------------------------------------------------

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Get('newsletter')
  listNewsletter() {
    return this.service.listNewsletter();
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Get('partner')
  listPartner(@Query('status') status?: InquiryStatus) {
    return this.service.listPartnerInquiries(status);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Patch('partner/:id')
  setPartnerStatus(
    @Param('id') id: string,
    @Body() body: { status: InquiryStatus; notes?: string },
  ) {
    return this.service.setPartnerStatus(id, body.status, body.notes);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Get('contact')
  listContact(@Query('status') status?: InquiryStatus) {
    return this.service.listContactInquiries(status);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Patch('contact/:id')
  setContactStatus(
    @Param('id') id: string,
    @Body() body: { status: InquiryStatus; notes?: string },
  ) {
    return this.service.setContactStatus(id, body.status, body.notes);
  }
}
