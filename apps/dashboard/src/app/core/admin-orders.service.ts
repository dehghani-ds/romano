import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  AdminOrderPage,
  AdminStats,
  OrderDetail,
  OrderStatus,
  OrderStatusHistoryEntry,
} from '@romano/domain';

import { apiUrl, toUserMessage } from './api';

export interface AdminOrderFilter {
  status?: OrderStatus | 'all';
  deliveryDate?: string | null;
  search?: string;
  page?: number;
  pageSize?: number;
}

/**
 * The admin console's data layer.
 *
 * Filtering and paging happen on the server. The old console pulled 500 rows
 * and narrowed them in the browser, which quietly stopped being the truth as
 * soon as there were more than 500 orders.
 */
@Injectable({ providedIn: 'root' })
export class AdminOrdersService {
  private readonly http = inject(HttpClient);

  async list(filter: AdminOrderFilter = {}): Promise<AdminOrderPage> {
    let params = new HttpParams();
    if (filter.status && filter.status !== 'all') params = params.set('status', filter.status);
    if (filter.deliveryDate) params = params.set('deliveryDate', filter.deliveryDate);
    if (filter.search?.trim()) params = params.set('search', filter.search.trim());
    if (filter.page) params = params.set('page', filter.page);
    if (filter.pageSize) params = params.set('pageSize', filter.pageSize);

    try {
      return await firstValueFrom(
        this.http.get<AdminOrderPage>(apiUrl('/admin/orders'), { params }),
      );
    } catch (error) {
      throw new Error(toUserMessage(error));
    }
  }

  async stats(): Promise<AdminStats> {
    try {
      return await firstValueFrom(this.http.get<AdminStats>(apiUrl('/admin/stats')));
    } catch (error) {
      throw new Error(toUserMessage(error));
    }
  }

  async byId(orderId: string): Promise<OrderDetail> {
    try {
      return await firstValueFrom(this.http.get<OrderDetail>(apiUrl(`/admin/orders/${orderId}`)));
    } catch (error) {
      throw new Error(toUserMessage(error));
    }
  }

  async history(orderId: string): Promise<OrderStatusHistoryEntry[]> {
    try {
      return await firstValueFrom(
        this.http.get<OrderStatusHistoryEntry[]>(apiUrl(`/admin/orders/${orderId}/history`)),
      );
    } catch (error) {
      throw new Error(toUserMessage(error));
    }
  }

  async setStatus(orderId: string, status: OrderStatus, note?: string | null): Promise<OrderDetail> {
    try {
      return await firstValueFrom(
        this.http.patch<OrderDetail>(apiUrl(`/admin/orders/${orderId}/status`), {
          status,
          note: note?.trim() || undefined,
        }),
      );
    } catch (error) {
      throw new Error(toUserMessage(error));
    }
  }

  async reviewPayment(
    orderId: string,
    approve: boolean,
    reason?: string | null,
  ): Promise<OrderDetail> {
    try {
      return await firstValueFrom(
        this.http.post<OrderDetail>(apiUrl(`/admin/orders/${orderId}/payment/review`), {
          approve,
          reason: reason?.trim() || undefined,
        }),
      );
    } catch (error) {
      throw new Error(toUserMessage(error));
    }
  }

  /** Receipts sit behind an authenticated endpoint — fetch bytes, not a link. */
  async receiptObjectUrl(orderId: string): Promise<string> {
    try {
      const blob = await firstValueFrom(
        this.http.get(apiUrl(`/admin/orders/${orderId}/receipt`), { responseType: 'blob' }),
      );
      return URL.createObjectURL(blob);
    } catch (error) {
      throw new Error(toUserMessage(error));
    }
  }
}
