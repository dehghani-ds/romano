import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';

import type { AuthUser } from '../auth/auth.types';
import { CurrentUser, OptionalAuthGuard } from '../auth/guards';
import type { AppConfig } from '../config/configuration';
import { GuestToken } from '../orders/guest-token.decorator';
import { PaymentsService, type StartedPayment } from './payments.service';

/**
 * The customer-facing half of online payment.
 *
 * Two of these three routes are ordinary JSON. The third is not: `callback` is
 * entered by the customer's browser on a redirect from the bank, so it answers
 * with a 302 to a page rather than a body, and it never fails — a person coming
 * back from their bank must land somewhere that explains itself, not on a JSON
 * error.
 */
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /**
   * Whether online payment is on at all.
   *
   * Public and unauthenticated because the answer is the same for everyone and
   * the site needs it before deciding which payment choices to render. A button
   * that appears and then fails at the bank is worse than one that never appears.
   */
  @Get('options')
  options(): { onlineEnabled: boolean; minAmount: number; currency: string } {
    return this.payments.options();
  }

  /**
   * Opens a payment session and says where to send the browser.
   *
   * The redirect is returned rather than performed: the caller is `fetch`, and a
   * 302 answered to `fetch` is followed by the HTTP layer instead of the window.
   */
  @Post('orders/:id/start')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OptionalAuthGuard)
  // Each of these opens a session at Zibal, so it is capped well below the
  // global default. Guest checkout means this is reachable unauthenticated.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  start(
    @Param('id', ParseUUIDPipe) id: string,
    @GuestToken() guestToken?: string,
    @CurrentUser() user?: AuthUser,
  ): Promise<StartedPayment> {
    return this.payments.start(id, { user, guestToken });
  }

  /**
   * Where Zibal sends the payer when the bank is done with them.
   *
   * `success` and `status` arrive on the query string too. They are read by
   * nobody: this endpoint takes the trackId as a hint that a session is worth
   * asking about, and asks Zibal directly. Everything else on this URL travelled
   * through the payer's own browser and is theirs to edit.
   */
  @Get('callback')
  async callback(@Query('trackId') trackId: string | undefined, @Res() response: Response): Promise<void> {
    const result = await this.payments.settleCallback(trackId);

    const base = this.config.get('webBaseUrl', { infer: true });
    const path = result.orderId ? `/orders/${result.orderId}` : '/orders';
    const query = new URLSearchParams({ payment: result.outcome, message: result.message });

    // The gateway's own page is the referrer, and this URL carries the outcome
    // of a payment — neither belongs in anyone's cache.
    response.setHeader('Cache-Control', 'no-store');
    response.redirect(HttpStatus.FOUND, `${base}${path}?${query.toString()}`);
  }
}
