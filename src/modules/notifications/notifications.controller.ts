import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  list(@CurrentUser('id') userId: string) {
    return this.service.list(userId);
  }

  @Post(':id/read')
  markRead(@Param('id') id: string) {
    return this.service.markRead(id);
  }

  @Post('read-all')
  markAllRead(@CurrentUser('id') userId: string) {
    return this.service.markAllRead(userId);
  }

  @Post('tokens')
  registerToken(
    @Body() body: { token: string; platform: 'IOS' | 'ANDROID' | 'WEB'; deviceId?: string },
    @CurrentUser('id') userId: string,
  ) {
    return this.service.registerToken(userId, body.token, body.platform, body.deviceId);
  }

  @Delete('tokens/:token')
  unregisterToken(@Param('token') token: string) {
    return this.service.unregisterToken(token);
  }
}
