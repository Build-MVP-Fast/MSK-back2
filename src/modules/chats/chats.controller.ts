import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ChatType } from '@prisma/client';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

import { ChatsService } from './chats.service';

@ApiTags('chats')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('chats')
export class ChatsController {
  constructor(private readonly service: ChatsService) {}

  @Get()
  list(@CurrentUser('id') userId: string, @Query('type') type?: ChatType) {
    return this.service.listForUser(userId, type);
  }

  @Get('department/:departmentId')
  departmentChats(@Param('departmentId') departmentId: string) {
    return this.service.listDepartmentChats(departmentId);
  }

  @Get('supplier')
  supplierChats(@CurrentUser('id') userId: string) {
    return this.service.listSupplierChats(userId);
  }

  @Get('guest/categories')
  guestCategoryChats(@CurrentUser('id') userId: string) {
    return this.service.listGuestCategoryChats(userId);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.service.detail(id);
  }

  @Get(':id/messages')
  messages(@Param('id') id: string, @Query('before') before?: string, @Query('limit') limit?: number) {
    return this.service.messages(id, {
      before: before ? new Date(before) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post(':id/messages')
  send(@Param('id') chatId: string, @Body() dto: any, @CurrentUser('id') userId: string) {
    return this.service.sendMessage({ ...dto, chatId, senderId: userId });
  }

  @Post(':id/read')
  markRead(@Param('id') chatId: string, @CurrentUser('id') userId: string) {
    return this.service.markRead(chatId, userId);
  }

  @Post('direct/:otherUserId')
  getOrCreateDirect(@Param('otherUserId') otherUserId: string, @CurrentUser('id') userId: string) {
    return this.service.getOrCreateDirect(userId, otherUserId);
  }

  /**
   * Mobile guest chat — pick (or lazily create) a STAFF_GUEST chat for
   * the given category label ("Reception" / "Housekeeping" / …). The
   * mobile category-picker calls this on tap, gets back a chat id, and
   * navigates to the detail screen. Idempotent: subsequent taps return
   * the same chat so the conversation thread persists between sessions.
   */
  @Post('guest/by-category/:category')
  getOrCreateGuestCategoryChat(
    @Param('category') category: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.getOrCreateGuestCategoryChat(userId, category);
  }

  @Post('group')
  createGroup(@Body() dto: any) {
    return this.service.createGroup(dto);
  }

  @Post(':id/members/:userId')
  addMember(@Param('id') chatId: string, @Param('userId') userId: string) {
    return this.service.addMember(chatId, userId);
  }
}
