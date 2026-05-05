import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentMethod, PaymentStatus } from '@prisma/client';
import Stripe from 'stripe';

import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly stripe: Stripe | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const key = this.config.get<string>('STRIPE_SECRET_KEY');
    this.stripe = key ? new Stripe(key) : null;
  }

  async createIntent(bookingId: string, amount: number, currency = 'USD') {
    if (!this.stripe) throw new Error('Stripe not configured');
    const intent = await this.stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: currency.toLowerCase(),
      metadata: { bookingId },
    });
    await this.prisma.bookingPayment.create({
      data: {
        bookingId,
        amount,
        currency,
        method: PaymentMethod.STRIPE,
        status: PaymentStatus.PENDING,
        providerRef: intent.id,
      },
    });
    return { clientSecret: intent.client_secret, intentId: intent.id };
  }

  async handleStripeWebhook(payload: Buffer, signature: string) {
    if (!this.stripe) throw new Error('Stripe not configured');
    const secret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!secret) throw new Error('Stripe webhook secret missing');
    const event = this.stripe.webhooks.constructEvent(payload, signature, secret);

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const intent = event.data.object as Stripe.PaymentIntent;
        await this.prisma.bookingPayment.updateMany({
          where: { providerRef: intent.id },
          data: { status: PaymentStatus.CAPTURED, paidAt: new Date() },
        });
        break;
      }
      case 'payment_intent.payment_failed': {
        const intent = event.data.object as Stripe.PaymentIntent;
        await this.prisma.bookingPayment.updateMany({
          where: { providerRef: intent.id },
          data: { status: PaymentStatus.FAILED, failureReason: intent.last_payment_error?.message },
        });
        break;
      }
      default:
        this.logger.debug(`Unhandled Stripe event: ${event.type}`);
    }
  }

  refund(paymentId: string) {
    return this.prisma.bookingPayment.update({
      where: { id: paymentId },
      data: { status: PaymentStatus.REFUNDED, refundedAt: new Date() },
    });
  }
}
