/**
 * Domain types, mirroring what the API returns.
 *
 * Field names are camelCase because that is what the API speaks — the snake_case
 * of the old PostgREST responses is gone along with it.
 *
 * Seats, zones and refrigerators are also gone. An order is delivered to a
 * company and a team, both captured on the order itself at checkout.
 */

export type OrderStatus = 'pending' | 'in_progress' | 'done' | 'cancelled';
export type PaymentStatus = 'awaiting_receipt' | 'submitted' | 'verified' | 'rejected';
export type PaymentMethod = 'receipt_upload' | 'ipg' | 'cash';
export type UserRole = 'customer' | 'admin';
export type ExpenseCategory = 'coffee' | 'supplies' | 'equipment' | 'other';

/** Everyone is here today. The field is free text so they need not stay. */
export const DEFAULT_COMPANY_NAME = 'دیجی‌پی';

/**
 * Where the money goes until an IPG exists. Card-to-card is the whole payment
 * flow today: the customer transfers, then uploads the receipt.
 *
 * Stored unformatted — the grouping is presentation, and what gets copied to the
 * clipboard is the bare digits, because that is what a banking app accepts.
 */
export const PAYMENT_CARD = {
  holder: 'محمدرضا دهقانی ابیانه',
  number: '6219861905572805',
} as const;

/** `6219861905572805` → `6219-8619-0557-2805`. Display only. */
export function formatCardNumber(number: string): string {
  return (number.match(/.{1,4}/g) ?? [number]).join('-');
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  /** What one of this is called — `فنجان` for coffee, `عدد` for a cookie. */
  unit: string;
  imageUrl: string | null;
  isActive: boolean;
  sortOrder: number;
}

/** The admin an expense is attributed to — four fields, no more. */
export interface ExpensePayer {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
}

/**
 * One line in the expense ledger: money that went out so Romano could run.
 *
 * It has exactly one payer. Splitting an expense across admins is not modelled
 * here and is settled outside the app.
 */
export interface Expense {
  id: string;
  title: string;
  amount: number;
  currency: string;
  category: ExpenseCategory;
  /** Gregorian `YYYY-MM-DD` on the wire, shown as a Jalali date. */
  spentAt: string;
  note: string | null;
  paidBy: ExpensePayer;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  mobile: string;
  companyName: string;
  teamName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
}

export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  /** Snapshotted with the price, so an old order keeps its own wording. */
  unit: string;
  unitPrice: number;
  lineTotal: number;
}

export interface OrderPayment {
  id: string;
  status: PaymentStatus;
  method: PaymentMethod;
  /** The storage key never leaves the server; this is all the UI needs. */
  hasReceipt: boolean;
  reference: string | null;
  rejectReason: string | null;
  paidAt: string | null;
}

/** Everything a list, card or detail page needs about one order. */
export interface OrderDetail {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  deliveryDate: string;
  totalAmount: number;
  currency: string;
  notes: string | null;
  adminNote: string | null;

  contactName: string;
  contactMobile: string;
  companyName: string;
  teamName: string;

  isGuest: boolean;
  customerUsername: string | null;

  acceptedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;

  items: OrderItem[];
  /**
   * Every line's quantity added up. Unit-agnostic on purpose: a basket of two
   * coffees and three cookies is five things, and the units live per item.
   */
  totalQuantity: number;
  productNames: string;
  payment: OrderPayment | null;
}

export interface OrderStatusHistoryEntry {
  id: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  note: string | null;
  createdAt: string;
}

// --- Requests --------------------------------------------------------------

/** One basket line. A product may appear at most once — merge, do not repeat. */
export interface OrderLineRequest {
  productId: string;
  quantity: number;
}

export interface PlaceOrderRequest {
  /** At least one line; the server prices every one of them itself. */
  items: OrderLineRequest[];
  notes?: string | null;
  deliveryDate?: string;
  /** Required for a guest; inherited from the profile for a signed-in customer. */
  contactName?: string;
  contactMobile?: string;
  companyName?: string;
  teamName?: string;
}

/** A guest's token comes back exactly once, at checkout. */
export interface PlacedOrder {
  order: OrderDetail;
  guestToken: string | null;
}

/**
 * Adding a product. Only `slug`, `name` and `price` are required — the rest
 * carry the column defaults (`IRR`, active, sort order 0).
 */
export interface CreateProductRequest {
  slug: string;
  name: string;
  price: number;
  description?: string;
  currency?: string;
  /** Defaults to `فنجان` when the admin leaves it blank. */
  unit?: string;
  imageUrl?: string;
  isActive?: boolean;
  sortOrder?: number;
}

/**
 * Editing a product. Every field is optional and absence means "leave it" —
 * `description` and `imageUrl` take `null` to clear them.
 *
 * `slug` is missing on purpose: it identifies the product in a URL and does not
 * change once the product exists.
 */
export interface UpdateProductRequest {
  name?: string;
  price?: number;
  description?: string | null;
  currency?: string;
  unit?: string;
  imageUrl?: string | null;
  isActive?: boolean;
  sortOrder?: number;
}

/**
 * Recording an expense. Only `title` and `amount` are required: the category
 * falls back to `other`, the date to today in Tehran, and the payer to whoever
 * is signed in.
 */
export interface CreateExpenseRequest {
  title: string;
  amount: number;
  category?: ExpenseCategory;
  /** Gregorian `YYYY-MM-DD`. Never in the future — the API refuses it. */
  spentAt?: string;
  note?: string;
  /** Another admin, when you are filing what a colleague paid for. */
  paidById?: string;
  currency?: string;
}

/**
 * Correcting an expense. Every field is optional and absence means "leave it" —
 * `note` takes `null` to clear it.
 *
 * Unlike a product, nothing here is off-limits: `paidById` is editable because
 * filing a receipt under the wrong colleague is the mistake most worth undoing.
 */
export interface UpdateExpenseRequest {
  title?: string;
  amount?: number;
  category?: ExpenseCategory;
  spentAt?: string;
  note?: string | null;
  paidById?: string;
  currency?: string;
}

export interface SignUpDetails {
  username: string;
  password: string;
  firstName: string;
  lastName: string;
  mobile: string;
  companyName?: string;
  teamName: string;
}

export interface ProfilePatch {
  firstName: string;
  lastName: string;
  mobile: string;
  companyName: string;
  teamName: string;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: UserProfile;
}

export interface AdminOrderPage {
  items: OrderDetail[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminStats {
  byStatus: Record<OrderStatus, number>;
  /** `quantity` counts things across every unit, so it is shown as a number. */
  tomorrow: { orders: number; quantity: number };
  awaitingReceiptReview: number;
}

// --- Presentation ----------------------------------------------------------

/** Status is never carried by colour alone — every entry has an icon and words. */
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

/**
 * Expense categories, with the icon each is read by — a category is never
 * carried by colour, and in the ledger it is never carried by the icon alone
 * either: the label sits beside it.
 */
export const EXPENSE_CATEGORY_META: Record<
  ExpenseCategory,
  { label: string; hint: string; icon: string }
> = {
  coffee: {
    label: 'قهوه',
    hint: 'دان، پودر، شیر — هرچه در فنجان می‌رود.',
    icon: 'coffee',
  },
  supplies: {
    label: 'لوازم مصرفی',
    hint: 'لیوان، درب، دستمال، شکر.',
    icon: 'cup',
  },
  equipment: {
    label: 'تجهیزات',
    hint: 'دستگاه، آسیاب، ابزار — چیزی که می‌ماند.',
    icon: 'wrench',
  },
  other: {
    label: 'متفرقه',
    hint: 'هر خرجی که در سه دستهٔ بالا نمی‌گنجد.',
    icon: 'tag',
  },
};

export const EXPENSE_CATEGORIES: ExpenseCategory[] = ['coffee', 'supplies', 'equipment', 'other'];

/** `علی رضایی` — the payer as a person reads them, username as the fallback. */
export function formatPayerName(payer: ExpensePayer): string {
  const name = `${payer.firstName} ${payer.lastName}`.trim();
  return name || payer.username;
}
