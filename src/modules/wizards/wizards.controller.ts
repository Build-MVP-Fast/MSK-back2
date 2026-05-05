import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { WizardKind } from '@prisma/client';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

import { WizardsService } from './wizards.service';

@ApiTags('wizards')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('wizards')
export class WizardsController {
  constructor(private readonly service: WizardsService) {}

  @Get(':kind')
  getState(@Param('kind') kind: WizardKind, @CurrentUser('id') userId: string) {
    return this.service.getState(userId, kind);
  }

  @Post(':kind')
  update(@Param('kind') kind: WizardKind, @Body() dto: any, @CurrentUser('id') userId: string) {
    return this.service.update(userId, kind, dto);
  }

  @Post(':kind/complete')
  complete(@Param('kind') kind: WizardKind, @CurrentUser('id') userId: string) {
    return this.service.complete(userId, kind);
  }
}
