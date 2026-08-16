import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { PaymentOptions, StartedPayment } from '@romano/domain';

import { apiUrl, toUserMessage } from './api';
import { GuestOrdersStore } from './guest-orders.store';

/**
 * Online payment.
 *
 * Deliberately thin. The gateway's rules — what a session costs, how long one
 * lives, whether a callback means anything — are all on the server, because they
 * are the same rules whether a browser or anything else is asking. What is left
 * here is one question ("is online payment even on?") and one instruction ("open
 * a session and tell me where to send this person").
 */
@Injectable({ providedIn: 'root' })
export class PaymentsService {
  private readonly http = inject(HttpClient);
  private readonly guests = inject(GuestOrdersStore);

  /**
   * Cached for the session: whether the gateway is configured is a property of
   * the deployment, not of the page, and every order screen asks.
   */
  private readonly cached = signal<PaymentOptions | null>(null);
  private inFlight: Promise<PaymentOptions> | null = null;

  async options(): Promise<PaymentOptions> {
    const known = this.cached();
    if (known) return known;

    // Two payment sections rendering at once must not fire two requests.
    this.inFlight ??= firstValueFrom(this.http.get<PaymentOptions>(apiUrl('/payments/options')))
      .then((options) => {
        this.cached.set(options);
        return options;
      })
      .catch(() => {
        // A gateway we cannot ask about is a gateway we do not offer. Failing
        // closed hides the online button rather than showing one that cannot
        // work — and `cardToCard: null` hides the card panel too, because
        // inventing a card number to pay into is the one wrong answer here.
        const off: PaymentOptions = {
          onlineEnabled: false,
          cardToCard: null,
          minAmount: 0,
          currency: 'IRR',
        };
        this.cached.set(off);
        return off;
      })
      .finally(() => {
        this.inFlight = null;
      });

    return this.inFlight;
  }

  /**
   * Opens a payment session and hands back where the browser must go.
   *
   * The navigation is the caller's to perform: this returns a URL rather than
   * assigning `location`, so the component can show its button as busy right up
   * until the page actually leaves.
   */
  async start(orderId: string): Promise<StartedPayment> {
    try {
      return await firstValueFrom(
        this.http.post<StartedPayment>(
          apiUrl(`/payments/orders/${orderId}/start`),
          {},
          this.guestOptions(orderId),
        ),
      );
    } catch (error) {
      throw new Error(toUserMessage(error));
    }
  }

  /** Adds the guest token for this order, when this browser holds one. */
  private guestOptions(orderId: string): { headers?: HttpHeaders } {
    const token = this.guests.tokenFor(orderId);
    return token ? { headers: new HttpHeaders({ 'X-Guest-Token': token }) } : {};
  }
}
