import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
    });
  }

  async onModuleInit() {
    const MAX = 10;
    const DELAY = 8_000;
    for (let i = 1; i <= MAX; i++) {
      try {
        await this.$connect();
        this.logger.log('Prisma connected to database');
        return;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (i === MAX) throw err;
        this.logger.warn(
          `Prisma $connect failed (attempt ${i}/${MAX}): ${msg.slice(0, 120)} — retrying in ${DELAY / 1000}s`,
        );
        await new Promise((r) => setTimeout(r, DELAY));
      }
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Helper to wrap a callback in a single transaction. Use this for any
   * write that touches multiple tables and must be atomic (e.g. creating
   * a Booking + AvailabilityBlock + RevenueEntry).
   */
  withTransaction<T>(fn: (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => Promise<T>): Promise<T> {
    return this.$transaction(fn);
  }
}
