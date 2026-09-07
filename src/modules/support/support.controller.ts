import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TicketStatus, UserRole } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SupportService } from './support.service';

@ApiTags('support')
@Controller('support')
export class SupportController {
  constructor(private readonly service: SupportService) {}

  // Public — anyone can submit a ticket
  @Public()
  @Post('tickets')
  create(@Body() dto: { subject: string; body: string; fromEmail: string; companyId?: string }) {
    return this.service.create(dto);
  }

  // Admin-only reads & actions
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Get('tickets')
  list(@Query('status') status?: TicketStatus) {
    return this.service.list(status);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Get('tickets/:id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Patch('tickets/:id/reply')
  reply(@Param('id') id: string, @Body() dto: { reply: string }) {
    return this.service.reply(id, dto.reply);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_USER)
  @Patch('tickets/:id/status')
  updateStatus(@Param('id') id: string, @Body() dto: { status: TicketStatus }) {
    return this.service.updateStatus(id, dto.status);
  }
}
