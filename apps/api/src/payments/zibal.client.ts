import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

import { MESSAGES } from '../common/messages';
import { PaymentSettingsService, type PaymentSettings } from './payment-settings.service';
import {
  normalizeTrackId,
  zibalResultMessage,
  ZIBAL_RESULT_OK,
  type ZibalRequestPayload,
  type ZibalRequestResponse,
  type ZibalVerifyResponse,
} from './zibal.protocol';

/** How long we wait on the gateway before giving up on a call. */
const TIMEOUT_MS = 15_000;

/**
 * The only thing in Romano that talks to Zibal.
 *
 * It does two jobs and no more: turn our numbers into Zibal's JSON, and turn
 * Zibal's JSON back into either a value or a Persian exception. It holds no
 * order state and touches no table, which is what lets `PaymentsService` be read
 * as a sequence of decisions rather than a mess of HTTP.
 *
 * The merchant credential is read from the settings row and attached here, on
 * the way out. It is never taken as an argument and never logged — this class is
 * the one place in the server it is allowed to exist as a plain string, and the
 * only direction it travels is outbound to Zibal.
 */
@Injectable()
export class ZibalClient {
  private readonly logger = new Logger('Zibal');

  constructor(private readonly settings: PaymentSettingsService) {}

  /** True when a merchant and callback URL are configured and the switch is on. */
  async isConfigured(): Promise<boolean> {
    return PaymentSettingsService.isOnlineReady(await this.settings.current());
  }

  /**
   * Opens a payment session and returns its trackId.
   *
   * `amount` is rial, which is what Zibal counts in and what Romano stores, so
   * nothing is converted here — a conversion is exactly the kind of thing that
   * goes wrong once and then charges someone ten times over.
   */
  async request(input: Omit<ZibalRequestPayload, 'merchant' | 'callbackUrl'>): Promise<string> {
    const settings = await this.requireConfigured();

    const body = await this.post<ZibalRequestResponse>('/v1/request', settings, {
      ...input,
      merchant: settings.zibalMerchant,
      callbackUrl: settings.zibalCallbackUrl,
    });

    if (body.result !== ZIBAL_RESULT_OK) {
      // The code is for us; the sentence is for the customer. Both exist because
      // "درگاه پیکربندی نشده" on screen is useless without a 102 in the log.
      // Note what is not in this line: the merchant that produced the 102.
      this.logger.error(`request rejected: result=${body.result} message=${body.message ?? ''}`);
      throw new ServiceUnavailableException({
        code: 'gateway_request_failed',
        message: zibalResultMessage(body.result),
      });
    }

    const trackId = normalizeTrackId(body.trackId);
    if (!trackId) {
      this.logger.error(`request returned an unusable trackId: ${JSON.stringify(body.trackId)}`);
      throw new ServiceUnavailableException({
        code: 'gateway_request_failed',
        message: MESSAGES.payment.gatewayUnavailable,
      });
    }

    return trackId;
  }

  /**
   * Asks Zibal what became of a session.
   *
   * Unlike `request`, a non-100 answer is returned rather than thrown: "this
   * payment failed" and "we could not ask" are different outcomes for the caller,
   * and only the second one is an error. Deciding which of Zibal's codes count
   * as settled belongs to the protocol table, not here.
   */
  async verify(trackId: string): Promise<ZibalVerifyResponse> {
    const settings = await this.requireConfigured();
    return this.post<ZibalVerifyResponse>('/v1/verify', settings, {
      merchant: settings.zibalMerchant,
      trackId: Number(trackId),
    });
  }

  /** Where the customer's browser is sent to actually pay. */
  async startUrl(trackId: string): Promise<string> {
    const { zibalBaseUrl } = await this.settings.current();
    return `${zibalBaseUrl.replace(/\/+$/, '')}/start/${encodeURIComponent(trackId)}`;
  }

  private async requireConfigured(): Promise<PaymentSettings> {
    const settings = await this.settings.current();
    if (!PaymentSettingsService.isOnlineReady(settings)) {
      throw new ServiceUnavailableException({
        code: 'gateway_disabled',
        message: MESSAGES.payment.gatewayDisabled,
      });
    }
    return settings;
  }

  private async post<T>(
    path: string,
    settings: PaymentSettings,
    payload: Record<string, unknown>,
  ): Promise<T> {
    const url = `${settings.zibalBaseUrl.replace(/\/+$/, '')}${path}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        // Without this, a gateway that accepts the connection and then says
        // nothing holds a checkout request open until the client gives up.
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.error(`POST ${path} failed to reach the gateway`, error as Error);
      throw new ServiceUnavailableException({
        code: 'gateway_unreachable',
        message: MESSAGES.payment.gatewayUnreachable,
      });
    }

    if (!response.ok) {
      this.logger.error(`POST ${path} answered HTTP ${response.status}`);
      throw new ServiceUnavailableException({
        code: 'gateway_unavailable',
        message: MESSAGES.payment.gatewayUnavailable,
      });
    }

    try {
      return (await response.json()) as T;
    } catch (error) {
      this.logger.error(`POST ${path} answered something that was not JSON`, error as Error);
      throw new ServiceUnavailableException({
        code: 'gateway_unavailable',
        message: MESSAGES.payment.gatewayUnavailable,
      });
    }
  }
}
