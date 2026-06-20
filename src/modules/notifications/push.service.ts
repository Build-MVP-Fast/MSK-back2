import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';

interface PushPayload {
  title: string;
  body?: string;
  data?: Record<string, unknown>;
}

interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly endpoint = 'https://exp.host/--/api/v2/push/send';

  constructor(private readonly prisma: PrismaService) {}

  async sendToUser(userId: string, payload: PushPayload) {
    const tokens = await this.prisma.notificationToken.findMany({
      where: { userId, isActive: true },
    });
    if (!tokens.length) return;

    const messages = tokens
      .filter((t) => t.token.startsWith('ExponentPushToken[') || t.token.startsWith('ExpoPushToken['))
      .map((t) => ({
        to: t.token,
        sound: 'default',
        title: payload.title,
        body: payload.body,
        data: payload.data ?? {},
      }));

    if (!messages.length) return;

    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messages),
      });
      if (!res.ok) {
        this.logger.warn(`Expo push HTTP ${res.status}`);
        return;
      }
      const json = (await res.json()) as { data?: ExpoTicket[] };
      const tickets = json.data ?? [];
      const toDeactivate: string[] = [];
      tickets.forEach((ticket, i) => {
        if (ticket.status === 'error') {
          const err = ticket.details?.error;
          if (err === 'DeviceNotRegistered') {
            toDeactivate.push(messages[i].to);
          } else {
            this.logger.warn(`Expo push ticket error: ${err ?? ticket.message}`);
          }
        }
      });
      if (toDeactivate.length) {
        await this.prisma.notificationToken.updateMany({
          where: { token: { in: toDeactivate } },
          data: { isActive: false },
        });
      }
    } catch (err) {
      this.logger.warn(`Expo push send failed: ${err instanceof Error ? err.message : err}`);
    }
  }
}
