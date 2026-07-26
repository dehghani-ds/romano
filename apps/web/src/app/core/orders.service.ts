import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  OrderDetail,
  OrderStatusHistoryEntry,
  PlaceOrderRequest,
  PlacedOrder,
} from '@romano/domain';

import { apiUrl, toUserMessage } from './api';
import { AuthService } from './auth.service';
import { GuestOrdersStore } from './guest-orders.store';

/**
 * Orders and receipts.
 *
 * The service layer on the server owns pricing, the status machine and the
 * audit trail; nothing here computes a total or decides what a status may
 * become. What this class does own is the guest token: it attaches the right
 * one to every request and files a new one away after checkout.
 */
@Injectable({ providedIn: 'root' })
export class OrdersService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly guests = inject(GuestOrdersStore);

  /** Place an order for tomorrow, signed in or not. */
  async place(input: PlaceOrderRequest): Promise<PlacedOrder> {
    try {
      const placed = await firstValueFrom(
        this.http.post<PlacedOrder>(apiUrl('/orders'), input),
      );

      if (placed.guestToken) {
        this.guests.remember({
          id: placed.order.id,
          orderNumber: placed.order.orderNumber,
          token: placed.guestToken,
        });
      }

      return placed;
    } catch (error) {
      throw new Error(toUserMessage(error));
    }
  }

  /**
   * Every order this browser can see: the account's own when signed in, plus
   * any still held as guest tokens.
   */
  async mine(): Promise<OrderDetail[]> {
    try {
      const [owned, guest] = await Promise.all([
        this.auth.isSignedIn()
          ? firstValueFrom(this.http.get<OrderDetail[]>(apiUrl('/orders/mine')))
          : Promise.resolve<OrderDetail[]>([]),
        this.guestOrders(),
      ]);

      // A claimed order can appear in both lists — keep one copy.
      const byId = new Map(owned.map((order) => [order.id, order]));
      for (const order of guest) byId.set(order.id, order);

      return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch (error) {
      throw new Error(toUserMessage(error));
    }
  }

  async byId(orderId: string): Promise<OrderDetail> {
    try {
      return await firstValueFrom(
        this.http.get<OrderDetail>(apiUrl(`/orders/${orderId}`), this.guestOptions(orderId)),
      );
    } catch (error) {
      throw new Error(toUserMessage(error));
    }
  }

  async history(orderId: string): Promise<OrderStatusHistoryEntry[]> {
    try {
      return await firstValueFrom(
        this.http.get<OrderStatusHistoryEntry[]>(
          apiUrl(`/orders/${orderId}/history`),
          this.guestOptions(orderId),
        ),
      );
    } catch (error) {
      throw new Error(toUserMessage(error));
    }
  }

  async cancel(orderId: string): Promise<OrderDetail> {
    try {
      return await firstValueFrom(
        this.http.post<OrderDetail>(
          apiUrl(`/orders/${orderId}/cancel`),
          {},
          this.guestOptions(orderId),
        ),
      );
    } catch (error) {
      throw new Error(toUserMessage(error));
    }
  }

  /** Look an order up by its number and the mobile it was placed with. */
  async track(orderNumber: string, mobile: string): Promise<OrderDetail> {
    try {
      const found = await firstValueFrom(
        this.http.post<PlacedOrder>(apiUrl('/orders/track'), { orderNumber, mobile }),
      );

      // Remember it so the order stays readable after leaving this page.
      if (found.guestToken) {
        this.guests.remember({
          id: found.order.id,
          orderNumber: found.order.orderNumber,
          token: found.guestToken,
        });
      }

      return found.order;
    } catch (error) {
      throw new Error(toUserMessage(error));
    }
  }

  // --- Receipts -------------------------------------------------------------

  async uploadReceipt(orderId: string, file: File): Promise<OrderDetail> {
    const body = new FormData();
    body.append('receipt', file);

    try {
      return await firstValueFrom(
        this.http.post<OrderDetail>(
          apiUrl(`/orders/${orderId}/receipt`),
          body,
          this.guestOptions(orderId),
        ),
      );
    } catch (error) {
      throw new Error(toUserMessage(error));
    }
  }

  /**
   * Fetches the receipt as a blob and hands back an object URL.
   *
   * It cannot be a plain link: the file sits behind an authenticated endpoint,
   * and a bare `<a href>` carries neither the bearer token nor the guest token.
   * Callers must revoke the URL when finished with it.
   */
  async receiptObjectUrl(orderId: string): Promise<string> {
    try {
      const blob = await firstValueFrom(
        this.http.get(apiUrl(`/orders/${orderId}/receipt`), {
          ...this.guestOptions(orderId),
          responseType: 'blob',
        }),
      );
      return URL.createObjectURL(blob);
    } catch (error) {
      throw new Error(toUserMessage(error));
    }
  }

  // --- Internals ------------------------------------------------------------

  private async guestOrders(): Promise<OrderDetail[]> {
    const tokens = this.guests.tokens();
    if (tokens.length === 0) return [];

    return firstValueFrom(
      this.http.post<OrderDetail[]>(apiUrl('/orders/by-tokens'), { tokens }),
    );
  }

  /** Adds the guest token for this order, when we hold one. */
  private guestOptions(orderId: string): { headers?: HttpHeaders } {
    const token = this.guests.tokenFor(orderId);
    return token ? { headers: new HttpHeaders({ 'X-Guest-Token': token }) } : {};
  }
}
