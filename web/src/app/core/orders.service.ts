import { Injectable, inject } from '@angular/core';
import {
  DeliveryTarget,
  Order,
  OrderDetail,
  OrderStatus,
  OrderStatusHistoryEntry,
} from './models';
import { SUPABASE, toUserMessage } from './supabase.client';

export interface PlaceOrderInput {
  productId: string;
  quantity: number;
  deliveryTarget: DeliveryTarget;
  notes?: string | null;
}

export interface AdminOrderFilter {
  status?: OrderStatus | 'all';
  deliveryDate?: string | null;
  search?: string;
}

/**
 * Orders and payments.
 *
 * Writes always go through the database RPCs, never through direct table
 * inserts: the server owns pricing, the delivery point, the status machine and
 * the audit trail. The client only reads.
 */
@Injectable({ providedIn: 'root' })
export class OrdersService {
  private readonly supabase = inject(SUPABASE);

  /** Place an order for tomorrow. Returns the created order. */
  async place(input: PlaceOrderInput): Promise<Order> {
    const { data, error } = await this.supabase.rpc('place_order', {
      p_product_id: input.productId,
      p_quantity: input.quantity,
      p_delivery_target: input.deliveryTarget,
      p_notes: input.notes ?? null,
    });

    if (error) throw new Error(toUserMessage(error));
    return data as unknown as Order;
  }

  /** Every order belonging to the signed-in user, newest first. */
  async mine(): Promise<OrderDetail[]> {
    const { data, error } = await this.supabase
      .from('order_details')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw new Error(toUserMessage(error));
    return (data ?? []) as OrderDetail[];
  }

  async byId(orderId: string): Promise<OrderDetail | null> {
    const { data, error } = await this.supabase
      .from('order_details')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();

    if (error) throw new Error(toUserMessage(error));
    return (data as OrderDetail | null) ?? null;
  }

  async history(orderId: string): Promise<OrderStatusHistoryEntry[]> {
    const { data, error } = await this.supabase
      .from('order_status_history')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true });

    if (error) throw new Error(toUserMessage(error));
    return (data ?? []) as OrderStatusHistoryEntry[];
  }

  async cancelMine(orderId: string): Promise<void> {
    const { error } = await this.supabase.rpc('cancel_my_order', { p_order_id: orderId });
    if (error) throw new Error(toUserMessage(error));
  }

  // --- Receipts ------------------------------------------------------------

  /**
   * Upload a receipt into the caller's own folder and attach it to the order.
   * The storage policy only accepts `<user_id>/…`, so the path is built here
   * rather than taken from the caller.
   */
  async uploadReceipt(userId: string, orderId: string, file: File): Promise<void> {
    const extension = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    const path = `${userId}/${orderId}-${Date.now()}.${extension}`;

    const { error: uploadError } = await this.supabase.storage
      .from('receipts')
      .upload(path, file, { upsert: false, contentType: file.type });

    if (uploadError) throw new Error(toUserMessage(uploadError));

    const { error } = await this.supabase.rpc('attach_receipt', {
      p_order_id: orderId,
      p_receipt_path: path,
    });

    if (error) throw new Error(toUserMessage(error));
  }

  /** A short-lived signed URL for viewing a private receipt. */
  async receiptUrl(path: string): Promise<string | null> {
    const { data, error } = await this.supabase.storage
      .from('receipts')
      .createSignedUrl(path, 60 * 5);

    if (error) {
      console.error('Failed to sign receipt URL', error);
      return null;
    }
    return data?.signedUrl ?? null;
  }

  // --- Admin ---------------------------------------------------------------

  /** All orders, for the admin console. RLS returns everything only to admins. */
  async all(filter: AdminOrderFilter = {}): Promise<OrderDetail[]> {
    let query = this.supabase.from('order_details').select('*');

    if (filter.status && filter.status !== 'all') {
      query = query.eq('status', filter.status);
    }
    if (filter.deliveryDate) {
      query = query.eq('delivery_date', filter.deliveryDate);
    }

    const search = filter.search?.trim();
    if (search) {
      query = query.or(
        `order_number.ilike.%${search}%,customer_username.ilike.%${search}%,` +
          `customer_first_name.ilike.%${search}%,customer_last_name.ilike.%${search}%`,
      );
    }

    const { data, error } = await query.order('created_at', { ascending: false }).limit(500);

    if (error) throw new Error(toUserMessage(error));
    return (data ?? []) as OrderDetail[];
  }

  async setStatus(orderId: string, status: OrderStatus, note?: string | null): Promise<void> {
    const { error } = await this.supabase.rpc('set_order_status', {
      p_order_id: orderId,
      p_status: status,
      p_note: note ?? null,
    });

    if (error) throw new Error(toUserMessage(error));
  }

  async reviewPayment(orderId: string, approve: boolean, reason?: string | null): Promise<void> {
    const { error } = await this.supabase.rpc('review_payment', {
      p_order_id: orderId,
      p_approve: approve,
      p_reason: reason ?? null,
    });

    if (error) throw new Error(toUserMessage(error));
  }
}
