import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { PaymentSettings, UpdatePaymentSettingsRequest } from '@romano/domain';

import { apiUrl, toUserMessage } from './api';

/**
 * Payment settings: the card money is transferred to, and the gateway.
 *
 * Note what this class cannot do. There is no way to read the Zibal merchant
 * key — `read()` answers with `zibalMerchantHint` and `zibalMerchantSet`, and
 * the server has no endpoint that returns the value. That is deliberate: it is
 * the one credential in the database, and a dashboard that could fetch it would
 * be a dashboard that could leak it.
 */
@Injectable({ providedIn: 'root' })
export class PaymentSettingsService {
  private readonly http = inject(HttpClient);

  async read(): Promise<PaymentSettings> {
    try {
      return await firstValueFrom(
        this.http.get<PaymentSettings>(apiUrl('/admin/payment-settings')),
      );
    } catch (error) {
      throw new Error(toUserMessage(error));
    }
  }

  /**
   * A patch: send the fields that changed, and the rest are left alone.
   *
   * Leaving `zibalMerchant` out keeps the existing key — which is the only thing
   * it can mean, since the form was never given the key to send back. Sending an
   * empty string clears it.
   */
  async update(patch: UpdatePaymentSettingsRequest): Promise<PaymentSettings> {
    try {
      return await firstValueFrom(
        this.http.patch<PaymentSettings>(apiUrl('/admin/payment-settings'), patch),
      );
    } catch (error) {
      throw new Error(toUserMessage(error));
    }
  }
}
