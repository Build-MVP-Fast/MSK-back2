import { Injectable, NotFoundException } from '@nestjs/common';
import { ChatMessageType, ChatType, NotificationChannel, Prisma } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ChatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** List the chats a user is a member of, grouped by type. */
  async listForUser(userId: string, type?: ChatType) {
    return this.prisma.chat.findMany({
      where: {
        ...(type && { type }),
        members: { some: { userId, leftAt: null } },
        isArchived: false,
      },
      include: {
        members: { include: { user: true } },
        messages: { take: 1, orderBy: { createdAt: 'desc' } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async detail(chatId: string) {
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      include: { members: { include: { user: true } } },
    });
    if (!chat) throw new NotFoundException('Chat not found');
    return chat;
  }

  /** Paginated message history. */
  messages(chatId: string, opts: { before?: Date; limit?: number } = {}) {
    return this.prisma.chatMessage.findMany({
      where: {
        chatId,
        ...(opts.before && { createdAt: { lt: opts.before } }),
      },
      include: { sender: true, replyTo: true },
      orderBy: { createdAt: 'desc' },
      take: opts.limit ?? 50,
    });
  }

  /** Create or get a 1-1 direct chat between two users. */
  async getOrCreateDirect(userIdA: string, userIdB: string) {
    const existing = await this.prisma.chat.findFirst({
      where: {
        type: ChatType.DIRECT,
        AND: [
          { members: { some: { userId: userIdA } } },
          { members: { some: { userId: userIdB } } },
        ],
      },
      include: { members: true },
    });
    if (existing) return existing;
    return this.prisma.chat.create({
      data: {
        type: ChatType.DIRECT,
        members: { create: [{ userId: userIdA }, { userId: userIdB }] },
      },
      include: { members: true },
    });
  }

  createGroup(dto: {
    title?: string;
    type: ChatType;
    departmentId?: string;
    propertyId?: string;
    category?: string;
    memberIds: string[];
  }) {
    return this.prisma.chat.create({
      data: {
        type: dto.type,
        title: dto.title,
        departmentId: dto.departmentId,
        propertyId: dto.propertyId,
        category: dto.category,
        members: { create: dto.memberIds.map((userId) => ({ userId })) },
      },
      include: { members: true },
    });
  }

  /** Send a message to a chat — used by both REST and WebSocket gateway. */
  async sendMessage(dto: {
    chatId: string;
    senderId?: string;
    type?: ChatMessageType;
    body?: string;
    attachmentUrl?: string;
    attachmentType?: string;
    replyToId?: string;
  }) {
    const message = await this.prisma.chatMessage.create({
      data: {
        chatId: dto.chatId,
        senderId: dto.senderId,
        type: dto.type ?? ChatMessageType.TEXT,
        body: dto.body,
        attachmentUrl: dto.attachmentUrl,
        attachmentType: dto.attachmentType,
        replyToId: dto.replyToId,
      },
      include: { sender: true },
    });
    await this.prisma.chat.update({ where: { id: dto.chatId }, data: { updatedAt: new Date() } });

    if (dto.senderId) {
      const others = await this.prisma.chatMember.findMany({
        where: { chatId: dto.chatId, leftAt: null, userId: { not: dto.senderId } },
        select: { userId: true },
      });
      const senderName = message.sender?.fullName ?? message.sender?.firstName ?? 'New message';
      const preview = (dto.body ?? (dto.attachmentUrl ? '📎 attachment' : '')).slice(0, 140);
      void Promise.allSettled(
        others.map((m) =>
          this.notifications.send({
            userId: m.userId,
            channel: NotificationChannel.PUSH,
            title: senderName,
            body: preview,
            data: { chatId: dto.chatId, kind: 'chat' },
          }),
        ),
      );
    }

    return message;
  }

  markRead(chatId: string, userId: string) {
    return this.prisma.chatMember.update({
      where: { chatId_userId: { chatId, userId } },
      data: { lastReadAt: new Date() },
    });
  }

  addMember(chatId: string, userId: string) {
    return this.prisma.chatMember.upsert({
      where: { chatId_userId: { chatId, userId } },
      create: { chatId, userId },
      update: { leftAt: null },
    });
  }

  removeMember(chatId: string, userId: string) {
    return this.prisma.chatMember.update({
      where: { chatId_userId: { chatId, userId } },
      data: { leftAt: new Date() },
    });
  }

  archive(chatId: string) {
    return this.prisma.chat.update({ where: { id: chatId }, data: { isArchived: true } });
  }

  /** List department chats (used by app's department-chats screen). */
  listDepartmentChats(departmentId: string) {
    return this.prisma.chat.findMany({
      where: { type: ChatType.DEPARTMENT, departmentId },
      include: { members: { include: { user: true } } },
    });
  }

  /** List supplier chats (staff <-> supplier). */
  listSupplierChats(userId: string) {
    return this.prisma.chat.findMany({
      where: {
        type: ChatType.SUPPLIER,
        members: { some: { userId, leftAt: null } },
      },
      include: { members: { include: { user: true } } },
    });
  }

  /**
   * List a guest's staff-guest category chats for the in-app chat
   * history screen. Each row carries the last-activity time, total
   * message count and the guest's unread count so the mobile list can
   * render without extra round-trips. Ordered most-recent-first.
   */
  async listGuestCategoryChats(userId: string) {
    const chats = await this.prisma.chat.findMany({
      where: {
        type: ChatType.STAFF_GUEST,
        members: { some: { userId, leftAt: null } },
      },
      include: {
        members: { where: { userId }, select: { lastReadAt: true } },
        messages: { take: 1, orderBy: { createdAt: 'desc' } },
        _count: { select: { messages: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return Promise.all(
      chats.map(async (chat) => {
        const lastReadAt = chat.members[0]?.lastReadAt ?? null;
        const lastMessage = chat.messages[0] ?? null;
        const unreadCount = await this.prisma.chatMessage.count({
          where: {
            chatId: chat.id,
            senderId: { not: userId },
            ...(lastReadAt && { createdAt: { gt: lastReadAt } }),
          },
        });
        return {
          id: chat.id,
          type: chat.type,
          title: chat.title,
          category: chat.category,
          createdAt: chat.createdAt,
          updatedAt: chat.updatedAt,
          messageCount: chat._count.messages,
          unreadCount,
          lastMessageAt: lastMessage?.createdAt ?? null,
          lastMessagePreview: lastMessage?.body ?? null,
        };
      }),
    );
  }

  /**
   * Find or create a STAFF_GUEST chat for one guest + one category
   * label. Used by the mobile category picker so tapping "Housekeeping"
   * always lands the guest in the same persistent thread, and a back-
   * office user can later be added as a member to respond.
   */
  async getOrCreateGuestCategoryChat(userId: string, category: string) {
    const trimmed = category.trim();
    const existing = await this.prisma.chat.findFirst({
      where: {
        type: ChatType.STAFF_GUEST,
        category: trimmed,
        members: { some: { userId, leftAt: null } },
      },
      include: { members: { include: { user: true } } },
    });
    if (existing) return existing;
    return this.prisma.chat.create({
      data: {
        type: ChatType.STAFF_GUEST,
        title: trimmed,
        category: trimmed,
        members: { create: { userId, role: 'owner' } },
      },
      include: { members: { include: { user: true } } },
    });
  }
}
