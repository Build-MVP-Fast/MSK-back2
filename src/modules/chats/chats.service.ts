import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus, ChatMessageType, ChatType, NotificationChannel, UserRole } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ChatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Authorization helpers ────────────────────────────────────────────

  /** True if the user is an active (not-left) member of the chat. */
  private async isMember(chatId: string, userId: string): Promise<boolean> {
    const member = await this.prisma.chatMember.findFirst({
      where: { chatId, userId, leftAt: null },
      select: { id: true },
    });
    return !!member;
  }

  /** Throw unless the caller is an active member of the chat — the single
   *  gate that stops a user reading or posting to a chat they don't belong
   *  to (chats are otherwise addressable by raw id). */
  private async assertMember(chatId: string, userId: string): Promise<void> {
    if (!(await this.isMember(chatId, userId))) {
      throw new ForbiddenException('You are not a member of this chat');
    }
  }

  /** Upsert a set of users as active members of a chat (idempotent —
   *  re-adds anyone who previously left). Skips falsy / duplicate ids. */
  private async addMembersToChat(
    chatId: string,
    userIds: string[],
    role: string = 'member',
  ): Promise<void> {
    const unique = [...new Set(userIds.filter(Boolean))];
    await Promise.all(
      unique.map((userId) =>
        this.prisma.chatMember.upsert({
          where: { chatId_userId: { chatId, userId } },
          create: { chatId, userId, role },
          update: { leftAt: null },
        }),
      ),
    );
  }

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

  async detail(chatId: string, userId: string) {
    await this.assertMember(chatId, userId);
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      include: { members: { include: { user: true } } },
    });
    if (!chat) throw new NotFoundException('Chat not found');
    return chat;
  }

  /** Paginated message history. Caller must be a member of the chat. */
  async messages(chatId: string, userId: string, opts: { before?: Date; limit?: number } = {}) {
    await this.assertMember(chatId, userId);
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

  // ── Contact discovery (who a role may start a chat with) ─────────────

  /**
   * The set of user-ids the caller is allowed to open a direct chat with,
   * enforcing the role matrix + tenant isolation:
   *   - ADMIN (operator): staff in their company + all active suppliers.
   *   - STAFF: operators + fellow staff in the same company.
   *   - SUPPLIER: operators they're linked to via orders.
   *   - others (guest): none (guests use category chats only).
   */
  private async contactIdsFor(caller: { id: string; role: UserRole; companyId: string | null }): Promise<Set<string>> {
    const ids = new Set<string>();
    if (caller.role === UserRole.ADMIN) {
      if (caller.companyId) {
        const staff = await this.prisma.user.findMany({
          where: { companyId: caller.companyId, role: UserRole.STAFF, isActive: true },
          select: { id: true },
        });
        staff.forEach((u) => ids.add(u.id));
      }
      const suppliers = await this.prisma.user.findMany({
        where: { role: UserRole.SUPPLIER, isActive: true },
        select: { id: true },
      });
      suppliers.forEach((u) => ids.add(u.id));
    } else if (caller.role === UserRole.STAFF) {
      if (caller.companyId) {
        const team = await this.prisma.user.findMany({
          where: {
            companyId: caller.companyId,
            role: { in: [UserRole.ADMIN, UserRole.STAFF] },
            isActive: true,
          },
          select: { id: true },
        });
        team.forEach((u) => ids.add(u.id));
      }
    } else if (caller.role === UserRole.SUPPLIER) {
      const orders = await this.prisma.order.findMany({
        where: { supplierId: caller.id, createdById: { not: null } },
        select: { createdById: true },
        distinct: ['createdById'],
      });
      const operatorIds = orders.map((o) => o.createdById!).filter(Boolean);
      if (operatorIds.length) {
        const operators = await this.prisma.user.findMany({
          where: { id: { in: operatorIds }, role: UserRole.ADMIN, isActive: true },
          select: { id: true },
        });
        operators.forEach((u) => ids.add(u.id));
      }
    }
    ids.delete(caller.id);
    return ids;
  }

  /** Full contact objects for the "new chat" picker. */
  async contacts(userId: string) {
    const caller = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, companyId: true },
    });
    if (!caller) throw new NotFoundException('User not found');
    const ids = await this.contactIdsFor(caller);
    if (!ids.size) return [];
    return this.prisma.user.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, fullName: true, firstName: true, lastName: true, role: true, avatarUrl: true },
      orderBy: { fullName: 'asc' },
    });
  }

  /** Create or get a 1-1 direct chat between two users. The caller may only
   *  open a direct chat with someone in their allowed contact set. */
  async getOrCreateDirect(userIdA: string, userIdB: string) {
    const caller = await this.prisma.user.findUnique({
      where: { id: userIdA },
      select: { id: true, role: true, companyId: true },
    });
    if (!caller) throw new NotFoundException('User not found');
    const allowed = await this.contactIdsFor(caller);
    if (!allowed.has(userIdB)) {
      throw new ForbiddenException('You cannot start a chat with this user');
    }
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

  /** Create a GROUP / DEPARTMENT / SUPPLIER chat. The creator is always
   *  added (as owner) so they can see and post to it, alongside the picked
   *  members. */
  async createGroup(
    creatorId: string,
    dto: {
      title?: string;
      type: ChatType;
      departmentId?: string;
      propertyId?: string;
      category?: string;
      memberIds: string[];
    },
  ) {
    const memberIds = [...new Set([creatorId, ...(dto.memberIds ?? [])].filter(Boolean))];
    return this.prisma.chat.create({
      data: {
        type: dto.type,
        title: dto.title,
        departmentId: dto.departmentId,
        propertyId: dto.propertyId,
        category: dto.category,
        members: {
          create: memberIds.map((userId) => ({
            userId,
            role: userId === creatorId ? 'owner' : 'member',
          })),
        },
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
            // One collapsed notification per chat (not one per message).
            collapseKey: `chat:${dto.chatId}`,
          }),
        ),
      );
    }

    return message;
  }

  /** REST entry point for sending: enforces that the sender belongs to the
   *  chat before delegating to the shared sendMessage. */
  async sendAsUser(
    chatId: string,
    userId: string,
    dto: { type?: ChatMessageType; body?: string; attachmentUrl?: string; attachmentType?: string; replyToId?: string },
  ) {
    await this.assertMember(chatId, userId);
    return this.sendMessage({ ...dto, chatId, senderId: userId });
  }

  async markRead(chatId: string, userId: string) {
    await this.assertMember(chatId, userId);
    return this.prisma.chatMember.update({
      where: { chatId_userId: { chatId, userId } },
      data: { lastReadAt: new Date() },
    });
  }

  /** Add a member to a chat. Only an existing member may add others. */
  async addMember(chatId: string, callerId: string, userId: string) {
    await this.assertMember(chatId, callerId);
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

  /** List department chats for a department, but only if the caller belongs
   *  to that department's company (tenant isolation). */
  async listDepartmentChats(departmentId: string, userId: string) {
    const department = await this.prisma.department.findUnique({
      where: { id: departmentId },
      select: { companyId: true },
    });
    if (!department) throw new NotFoundException('Department not found');
    const caller = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { companyId: true },
    });
    if (!caller?.companyId || caller.companyId !== department.companyId) {
      throw new ForbiddenException('You cannot view this department');
    }
    return this.prisma.chat.findMany({
      where: { type: ChatType.DEPARTMENT, departmentId },
      include: { members: { include: { user: true } } },
    });
  }

  /**
   * Get-or-create the DEPARTMENT chat for a department, adding the caller +
   * every department member. Idempotent (one chat per department). Tenant-
   * safe: the caller must belong to the department's company.
   */
  async openDepartmentChat(userId: string, departmentId: string) {
    const dept = await this.prisma.department.findUnique({
      where: { id: departmentId },
      select: { id: true, name: true, companyId: true },
    });
    if (!dept) throw new NotFoundException('Department not found');
    const caller = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { companyId: true },
    });
    if (!caller?.companyId || caller.companyId !== dept.companyId) {
      throw new ForbiddenException('You cannot open this department chat');
    }

    const members = await this.prisma.departmentMember.findMany({
      where: { departmentId },
      select: { userId: true },
    });
    const memberIds = [userId, ...members.map((m) => m.userId)];

    const existing = await this.prisma.chat.findFirst({
      where: { type: ChatType.DEPARTMENT, departmentId },
      select: { id: true },
    });
    if (existing) {
      await this.addMembersToChat(existing.id, memberIds);
      return this.detailRaw(existing.id);
    }
    const chat = await this.prisma.chat.create({
      data: {
        type: ChatType.DEPARTMENT,
        title: dept.name,
        departmentId,
        members: {
          create: [...new Set(memberIds)].map((uid) => ({
            userId: uid,
            role: uid === userId ? 'owner' : 'member',
          })),
        },
      },
    });
    return this.detailRaw(chat.id);
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
    if (existing) {
      // Heal older / pre-routing chats that only have the guest: make sure
      // the property team is attached so the message is actually received.
      const hasStaff = existing.members.some((m) => m.userId !== userId && !m.leftAt);
      if (!hasStaff) await this.routeGuestCategoryChat(existing.id, userId, trimmed);
      return this.detailRaw(existing.id);
    }
    const chat = await this.prisma.chat.create({
      data: {
        type: ChatType.STAFF_GUEST,
        title: trimmed,
        category: trimmed,
        members: { create: { userId, role: 'owner' } },
      },
    });
    await this.routeGuestCategoryChat(chat.id, userId, trimmed);
    return this.detailRaw(chat.id);
  }

  /** Fetch a chat with members regardless of caller (internal use, after
   *  we've already established the caller's relationship). */
  private detailRaw(chatId: string) {
    return this.prisma.chat.findUnique({
      where: { id: chatId },
      include: { members: { include: { user: true } } },
    });
  }

  /**
   * Connect a guest category chat to the right property team so it isn't a
   * dead-end. Resolves the guest's current/most-relevant booking → property
   * → company, then adds:
   *   - every active Property Operator (ADMIN) of that company (always — the
   *     guaranteed recipient), and
   *   - staff of a Department whose name matches the category, if one exists.
   * Also stamps the chat's propertyId for context. Tenant-safe: only users
   * of the guest's own property's company are ever added.
   */
  private async routeGuestCategoryChat(chatId: string, guestUserId: string, category: string) {
    const guest = await this.prisma.user.findUnique({
      where: { id: guestUserId },
      select: { email: true },
    });
    const booking = await this.prisma.booking.findFirst({
      where: {
        OR: [
          { guestUserId },
          ...(guest?.email ? [{ guestEmail: guest.email }] : []),
        ],
        status: { notIn: [BookingStatus.CANCELLED, BookingStatus.NO_SHOW] },
      },
      orderBy: [{ checkedInAt: 'desc' }, { checkIn: 'desc' }],
      select: { propertyId: true, property: { select: { companyId: true } } },
    });
    if (!booking?.property?.companyId) return; // no property yet → leave as-is
    const companyId = booking.property.companyId;

    const operators = await this.prisma.user.findMany({
      where: { role: UserRole.ADMIN, companyId, isActive: true },
      select: { id: true },
    });

    const department = await this.prisma.department.findFirst({
      where: { companyId, name: { equals: category, mode: 'insensitive' } },
      select: { id: true },
    });
    const deptStaff = department
      ? await this.prisma.departmentMember.findMany({
          where: { departmentId: department.id },
          select: { userId: true },
        })
      : [];

    const memberIds = [...operators.map((o) => o.id), ...deptStaff.map((d) => d.userId)];
    if (memberIds.length) await this.addMembersToChat(chatId, memberIds);
    if (booking.propertyId) {
      await this.prisma.chat.update({
        where: { id: chatId },
        data: { propertyId: booking.propertyId },
      });
    }
  }
}
