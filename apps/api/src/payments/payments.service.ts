import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

import { MESSAGES } from '../common/messages';
import { OrdersService, type Viewer } from '../orders/orders.service';
import {
  PaymentSettingsService,
  type PublicPaymentOptions,
} from './payment-settings.service';
import { ZibalClient } from './zibal.client';
import {
  isPaidStatus,
  isSettledResult,
  normalizeTrackId,
  parseZibalPaidAt,
  zibalResultMessage,
  zibalStatusMessage,
  ZIBAL_CURRENCY,
  ZIBAL_MIN_AMOUNT_RIAL,
  ZIBAL_SESSION_TTL_MS,
} from './zibal.protocol';

/** What a settled callback tells the customer, and where to send them next. */
export interface SettlementResult {
  orderId: string | null;
  outcome: 'paid' | 'failed' | 'unknown';
  message: string;
}

export interface StartedPayment {
  /** Where the browser must go to pay. */
  redirectUrl: string;
  trackId: string;
  amount: number;
}

/**
 * Online payment, from "the customer pressed pay" to "the order is settled".
 *
 * The split of responsibilities here is the whole point of the module:
 *
 *   `ZibalClient`    speaks HTTP and knows the credential.
 *   `zibal.protocol` knows what Zibal's numbers mean.
 *   this class       decides what any of it means for an order.
 *   `OrdersService`  performs every write to the `payments` table.
 *
 * The rule that survives all four is that **nothing that arrives on the callback
 * is believed**. Zibal redirects the payer's own browser back to us with
 * `success=1` in the query string, which is to say the customer types the
 * outcome of their own payment. So the callback is treated as a *hint that a
 * session is worth asking about*, and the answer comes from `verify`.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger('Payments');

  constructor(
    private readonly orders: OrdersService,
    private readonly zibal: ZibalClient,
    private readonly settings: PaymentSettingsService,
  ) {}

  /**
   * What the customer site needs in order to render the payment section.
   *
   * Public and unauthenticated, so it carries only what a customer is shown
   * anyway: whether the online button applies, and the card to transfer to. The
   * gateway credential is not part of this shape and never will be.
   */
  async options(): Promise<PublicPaymentOptions> {
    const settings = await this.settings.current();

    return {
      onlineEnabled: PaymentSettingsService.isOnlineReady(settings),
      cardToCard: settings.cardToCardEnabled
        ? { holder: settings.cardHolder, number: settings.cardNumber }
        : null,
      minAmount: ZIBAL_MIN_AMOUNT_RIAL,
      currency: ZIBAL_CURRENCY,
    };
  }

  /**
   * Opens — or re-opens — a payment session for an order.
   *
   * A session that is still fresh is handed back as-is rather than replaced. Two
   * live sessions on one order is the failure that actually costs money: the
   * customer pays the one we stopped watching, the callback we do get is for the
   * other, and the order stays unpaid with the money gone.
   */
  async start(orderId: string, viewer: Viewer): Promise<StartedPayment> {
    if (!(await this.zibal.isConfigured())) {
      throw new ServiceUnavailableException({
        code: 'gateway_disabled',
        message: MESSAGES.payment.gatewayDisabled,
      });
    }

    const target = await this.orders.loadForGatewayPayment(orderId, viewer);
    const amount = this.assertPayable(target.amount, target.currency);

    const open = target.openSession;
    if (open && Date.now() - open.requestedAt.getTime() < ZIBAL_SESSION_TTL_MS) {
      return {
        redirectUrl: await this.zibal.startUrl(open.trackId),
        trackId: open.trackId,
        amount,
      };
    }

    const trackId = await this.zibal.request({
      amount,
      // Zibal echoes this back on the callback and shows it in their reporting.
      // It is our order *number*, not the id: the number is what a person quotes
      // when they ring up about a payment, and the id is not theirs to hand out.
      orderId: target.orderNumber,
      description: `رومانو — ${target.orderNumber}${target.productNames ? ` — ${target.productNames}` : ''}`,
      mobile: target.contactMobile,
    });

    await this.orders.openGatewaySession(target.orderId, trackId);

    return { redirectUrl: await this.zibal.startUrl(trackId), trackId, amount };
  }

  /**
   * Where to send the payer once their visit to the bank is over.
   *
   * Read from the settings row rather than a build-time constant, so that moving
   * the site to a new domain is an edit in the dashboard.
   */
  async returnBaseUrl(): Promise<string> {
    const { webBaseUrl } = await this.settings.current();
    return webBaseUrl ?? '';
  }

  /**
   * Settles whatever the customer has just come back from.
   *
   * Never throws: this runs on a redirect the customer is looking at, so every
   * path has to end in a page and a sentence rather than a JSON error. What
   * cannot be settled is logged and reported as `unknown`, which leaves the
   * session open and lets them try again.
   */
  async settleCallback(rawTrackId: string | undefined): Promise<SettlementResult> {
    const trackId = normalizeTrackId(rawTrackId);
    if (!trackId) {
      return { orderId: null, outcome: 'unknown', message: MESSAGES.payment.sessionNotFound };
    }

    const session = await this.orders.findGatewaySession(trackId);
    if (!session) {
      // Either a replayed callback for a session we have already given up on, or
      // a trackId that was never ours. Both are the same non-event.
      return { orderId: null, outcome: 'unknown', message: MESSAGES.payment.sessionNotFound };
    }

    // Settled already — the payer refreshed, or the redirect was retried. Say
    // "paid" again rather than asking Zibal a second time.
    if (session.isVerified) {
      return { orderId: session.orderId, outcome: 'paid', message: MESSAGES.payment.alreadyPaid };
    }

    let verification;
    try {
      verification = await this.zibal.verify(trackId);
    } catch (error) {
      this.logger.error(`verify failed for trackId=${trackId}`, error as Error);
      return {
        orderId: session.orderId,
        outcome: 'unknown',
        message: MESSAGES.payment.gatewayUnreachable,
      };
    }

    if (!isSettledResult(verification.result)) {
      this.logger.warn(
        `verify refused trackId=${trackId} result=${verification.result} status=${verification.status}`,
      );
      await this.orders.settleGatewaySession(trackId, { paid: false });
      return {
        orderId: session.orderId,
        outcome: 'failed',
        // A failed *payment* is better explained by its status than by the
        // result code, which mostly says "there was nothing to verify".
        message: verification.status
          ? zibalStatusMessage(verification.status)
          : zibalResultMessage(verification.result),
      };
    }

    if (!isPaidStatus(verification.status)) {
      await this.orders.settleGatewaySession(trackId, { paid: false });
      return {
        orderId: session.orderId,
        outcome: 'failed',
        message: zibalStatusMessage(verification.status),
      };
    }

    // The one check that is worth making even though it should be impossible:
    // we chose the amount, so a mismatch means the session is not the one we
    // opened. Refuse to mark the order paid on someone else's money.
    if (verification.amount !== undefined && verification.amount !== Math.round(session.amount)) {
      this.logger.error(
        `verify amount mismatch trackId=${trackId} expected=${Math.round(session.amount)} got=${verification.amount}`,
      );
      return {
        orderId: session.orderId,
        outcome: 'unknown',
        message: MESSAGES.payment.amountMismatch,
      };
    }

    await this.orders.settleGatewaySession(trackId, {
      paid: true,
      reference: verification.refNumber !== undefined ? String(verification.refNumber) : null,
      cardNumber: verification.cardNumber?.slice(0, 32) ?? null,
      paidAt: parseZibalPaidAt(verification.paidAt),
    });

    return {
      orderId: session.orderId,
      outcome: 'paid',
      message: zibalStatusMessage(verification.status),
    };
  }

  /**
   * Zibal's own limits, applied before we bother it.
   *
   * Rounding is safe here rather than lossy: `payments.amount` is
   * `Decimal(12, 2)` because the column is generic, but rial has no minor unit
   * and every price in the catalogue is whole.
   */
  private assertPayable(amount: number, currency: string): number {
    if (currency !== ZIBAL_CURRENCY) {
      throw new BadRequestException({
        code: 'currency_not_supported',
        message: MESSAGES.payment.currencyNotSupported,
      });
    }

    const rial = Math.round(amount);
    if (rial < ZIBAL_MIN_AMOUNT_RIAL) {
      throw new ConflictException({
        code: 'amount_below_gateway_minimum',
        message: MESSAGES.payment.amountTooSmall(
          new Intl.NumberFormat('fa-IR').format(ZIBAL_MIN_AMOUNT_RIAL),
        ),
      });
    }

    return rial;
  }
}
