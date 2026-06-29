import { Injectable } from '@nestjs/common';
import { NotificationChannel, NotificationStatus } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';
import { EmailService } from './email.service';
import { PushService } from './push.service';

interface SendNotificationInput {
  userId: string;
  channel: NotificationChannel;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
  /**
   * When set, collapse into a single notification per (user, collapseKey)
   * instead of creating a new row each time — e.g. one entry per chat that
   * updates in place. Keeps the notification list short and professional.
   */
  collapseKey?: string;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
    private readonly email: EmailService,
  ) {}

  async send(input: SendNotificationInput) {
    const data = input.collapseKey
      ? { ...(input.data ?? {}), collapseKey: input.collapseKey }
      : input.data;

    // Collapse: reuse the existing notification for this (user, collapseKey)
    // — update its content, mark it unread again, and float it to the top —
    // so a busy chat is one entry, not one per message.
    const existing = input.collapseKey
      ? await this.prisma.notification.findFirst({
          where: {
            userId: input.userId,
            data: { path: ['collapseKey'], equals: input.collapseKey },
          },
          orderBy: { createdAt: 'desc' },
        })
      : null;

    const notification = existing
      ? await this.prisma.notification.update({
          where: { id: existing.id },
          data: {
            title: input.title,
            body: input.body,
            data: data as any,
            status: NotificationStatus.PENDING,
            readAt: null,
            sentAt: null,
            createdAt: new Date(),
          },
        })
      : await this.prisma.notification.create({
          data: {
            userId: input.userId,
            channel: input.channel,
            title: input.title,
            body: input.body,
            data: data as any,
          },
        });

    try {
      if (input.channel === NotificationChannel.PUSH) {
        await this.push.sendToUser(input.userId, {
          title: input.title,
          body: input.body,
          data: input.data,
        });
      }
      if (input.channel === NotificationChannel.EMAIL) {
        await this.email.sendToUser(input.userId, input.title, input.body ?? '');
      }
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: { status: NotificationStatus.SENT, sentAt: new Date() },
      });
    } catch (err) {
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: { status: NotificationStatus.FAILED },
      });
    }
    return notification;
  }

  list(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  markRead(id: string) {
    return this.prisma.notification.update({
      where: { id },
      data: { status: NotificationStatus.READ, readAt: new Date() },
    });
  }

  markAllRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { status: NotificationStatus.READ, readAt: new Date() },
    });
  }

  registerToken(userId: string, token: string, platform: 'IOS' | 'ANDROID' | 'WEB', deviceId?: string) {
    return this.prisma.notificationToken.upsert({
      where: { token },
      create: { userId, token, platform, deviceId, isActive: true },
      update: { userId, isActive: true, deviceId },
    });
  }

  unregisterToken(token: string) {
    return this.prisma.notificationToken.update({
      where: { token },
      data: { isActive: false },
    });
  }

  // ── Preferences ─────────────────────────────────────────────────
  // Stored on the User.metadata JSON column to avoid a migration. Any
  // unknown / legacy users start with all toggles ON, matching how the
  // mobile UI's switches are pre-rendered.
  private static readonly DEFAULT_PREFS = {
    taskUpdates: true,
    shiftAlerts: true,
    propertyStatus: true,
    chatMessages: true,
  };

  async getPreferences(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { metadata: true },
    });
    const meta =
      user?.metadata && typeof user.metadata === 'object' && !Array.isArray(user.metadata)
        ? (user.metadata as Record<string, unknown>)
        : {};
    const prefs = (meta.notificationPreferences as Record<string, boolean> | undefined) ?? {};
    return { ...NotificationsService.DEFAULT_PREFS, ...prefs };
  }

  async updatePreferences(
    userId: string,
    patch: Partial<typeof NotificationsService.DEFAULT_PREFS>,
  ) {
    const current = await this.getPreferences(userId);
    const next = { ...current, ...patch };
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { metadata: true },
    });
    const meta =
      user?.metadata && typeof user.metadata === 'object' && !Array.isArray(user.metadata)
        ? (user.metadata as Record<string, unknown>)
        : {};
    await this.prisma.user.update({
      where: { id: userId },
      data: { metadata: { ...meta, notificationPreferences: next } as any },
    });
    return next;
  }
}
