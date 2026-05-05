import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  RawBodyRequest,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';

import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

import { PaymentsService } from './payments.service';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly service: PaymentsService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('booking/:bookingId/intent')
  createIntent(
    @Param('bookingId') bookingId: string,
    @Body() body: { amount: number; currency?: string },
  ) {
    return this.service.createIntent(bookingId, body.amount, body.currency);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('webhook/stripe')
  stripeWebhook(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') sig: string) {
    return this.service.handleStripeWebhook(req.rawBody!, sig);
  }
}
