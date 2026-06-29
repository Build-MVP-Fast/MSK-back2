import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { ChatType } from '@prisma/client';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { StorageService } from '../photos/storage.service';

import { ChatsService } from './chats.service';

@ApiTags('chats')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('chats')
export class ChatsController {
  constructor(
    private readonly service: ChatsService,
    private readonly storage: StorageService,
  ) {}

  /** Upload a chat attachment (image) and get back its URL. The client then
   *  sends a message carrying that attachmentUrl. */
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  @Post('upload')
  async uploadAttachment(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('File is required');
    const stored = await this.storage.upload(
      file.buffer,
      file.mimetype || 'application/octet-stream',
      'chat-attachments',
    );
    return { url: stored.url, type: file.mimetype };
  }

  @Get()
  list(@CurrentUser('id') userId: string, @Query('type') type?: ChatType) {
    return this.service.listForUser(userId, type);
  }

  @Get('department/:departmentId')
  departmentChats(
    @Param('departmentId') departmentId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.listDepartmentChats(departmentId, userId);
  }

  @Get('supplier')
  supplierChats(@CurrentUser('id') userId: string) {
    return this.service.listSupplierChats(userId);
  }

  /** People the caller may start a new chat with (role-aware, tenant-scoped). */
  @Get('contacts')
  contacts(@CurrentUser('id') userId: string) {
    return this.service.contacts(userId);
  }

  @Get('guest/categories')
  guestCategoryChats(@CurrentUser('id') userId: string) {
    return this.service.listGuestCategoryChats(userId);
  }

  @Get(':id')
  detail(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.detail(id, userId);
  }

  @Get(':id/messages')
  messages(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Query('before') before?: string,
    @Query('limit') limit?: number,
  ) {
    return this.service.messages(id, userId, {
      before: before ? new Date(before) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post(':id/messages')
  send(@Param('id') chatId: string, @Body() dto: any, @CurrentUser('id') userId: string) {
    return this.service.sendAsUser(chatId, userId, dto);
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
  createGroup(@Body() dto: any, @CurrentUser('id') creatorId: string) {
    return this.service.createGroup(creatorId, dto);
  }

  @Post(':id/members/:userId')
  addMember(
    @Param('id') chatId: string,
    @Param('userId') userId: string,
    @CurrentUser('id') callerId: string,
  ) {
    return this.service.addMember(chatId, callerId, userId);
  }
}
