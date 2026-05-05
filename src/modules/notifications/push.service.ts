import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';

interface PushPayload {
  title: string;
  body?: string;
  data?: Record<string, unknown>;
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(private readonly prisma: PrismaService) {}

  async sendToUser(userId: string, payload: PushPayload) {
    const tokens = await this.prisma.notificationToken.findMany({
      where: { userId, isActive: true },
    });
    // TODO: integrate with Expo Push API or FCM here.
    // Stubbed for now — log so dev can see the dispatch.
    this.logger.debug(`[PUSH] → ${tokens.length} device(s) for user ${userId}: ${payload.title}`);
  }
}
