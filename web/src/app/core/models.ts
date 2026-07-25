/**
 * Domain types, mirroring the Postgres schema in supabase/migrations/.
 *
 * Regenerate the full machine types with:
 *   supabase gen types typescript --project-id mhyizhxbsujhlaahnrjc
 * These hand-written types cover exactly what the UI uses.
 */

export type OrderStatus = 'pending' | 'in_progress' | 'done' | 'cancelled';
export type DeliveryTarget = 'seat' | 'refrigerator';
export type PaymentStatus = 'awaiting_receipt' | 'submitted' | 'verified' | 'rejected';
export type PaymentMethod = 'receipt_upload' | 'ipg' | 'cash';
export type UserRole = 'customer' | 'admin';

export interface Zone {
  id: string;
  code: string;
  name: string;
  floor: number | null;
  sort_order: number;
}

export interface Refrigerator {
  id: string;
  zone_id: string;
  code: string;
  label: string;
  description: string | null;
  is_active: boolean;
}

export interface Seat {
  id: string;
  zone_id: string;
  code: string;
  label: string;
  nearest_refrigerator_id: string | null;
  is_active: boolean;
}

/** A seat with its zone and fridge resolved, for pickers and summaries. */
export interface SeatOption extends Seat {
  zones: Pick<Zone, 'id' | 'code' | 'name' | 'floor'> | null;
  refrigerators: Pick<Refrigerator, 'id' | 'code' | 'label' | 'description'> | null;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  image_url: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface Profile {
  id: string;
  username: string;
  first_name: string;
  last_name: string;
  mobile: string;
  seat_id: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** A profile joined with its seat, zone and nearest fridge. */
export interface ProfileWithSeat extends Profile {
  seats: SeatOption | null;
}

export interface Order {
  id: string;
  order_number: string;
  user_id: string;
  status: OrderStatus;
  delivery_date: string;
  delivery_target: DeliveryTarget;
  seat_id: string | null;
  refrigerator_id: string | null;
  total_amount: number;
  currency: string;
  notes: string | null;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
}

/** One row of the `order_details` view — everything a list or card needs. */
export interface OrderDetail {
  id: string;
  order_number: string;
  user_id: string;
  status: OrderStatus;
  delivery_date: string;
  delivery_target: DeliveryTarget;
  total_amount: number;
  currency: string;
  notes: string | null;
  admin_note: string | null;
  accepted_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;

  customer_username: string | null;
  customer_first_name: string | null;
  customer_last_name: string | null;
  customer_mobile: string | null;

  seat_code: string | null;
  seat_label: string | null;
  refrigerator_code: string | null;
  refrigerator_label: string | null;
  zone_name: string | null;

  payment_id: string | null;
  payment_status: PaymentStatus | null;
  payment_method: PaymentMethod | null;
  receipt_path: string | null;
  payment_reference: string | null;
  payment_reject_reason: string | null;
  payment_paid_at: string | null;

  total_cups: number | null;
  product_names: string | null;
}

export interface OrderStatusHistoryEntry {
  id: string;
  order_id: string;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  note: string | null;
  created_at: string;
}

export interface SignUpDetails {
  username: string;
  password: string;
  firstName: string;
  lastName: string;
  mobile: string;
  seatId: string;
}

/** Presentation metadata for each status — colour is never the only signal. */
export const ORDER_STATUS_META: Record<
  OrderStatus,
  { label: string; description: string; icon: string }
> = {
  pending: {
    label: 'در انتظار',
    description: 'منتظر تأیید مدیر است.',
    icon: 'clock',
  },
  in_progress: {
    label: 'در حال آماده‌سازی',
    description: 'تأیید شد — برای فردا آماده می‌شود.',
    icon: 'refresh',
  },
  done: {
    label: 'تحویل شد',
    description: 'سفارش تحویل داده شد.',
    icon: 'check',
  },
  cancelled: {
    label: 'لغو شد',
    description: 'این سفارش تحویل داده نمی‌شود.',
    icon: 'x',
  },
};

export const PAYMENT_STATUS_META: Record<PaymentStatus, { label: string; hint: string }> = {
  awaiting_receipt: {
    label: 'بدون رسید',
    hint: 'هنوز رسیدی بارگذاری نشده است. می‌توانید بعداً اضافه کنید.',
  },
  submitted: { label: 'رسید بارگذاری شد', hint: 'منتظر بررسی مدیر است.' },
  verified: { label: 'پرداخت تأیید شد', hint: 'مدیر پرداخت را تأیید کرده است.' },
  rejected: { label: 'رسید رد شد', hint: 'رسید درست را دوباره بارگذاری کنید.' },
};

export const ORDER_STATUSES: OrderStatus[] = ['pending', 'in_progress', 'done', 'cancelled'];
