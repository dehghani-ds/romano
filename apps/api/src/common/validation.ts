/**
 * Field shapes shared by the DTOs, kept in one place so the API, the database
 * CHECK constraints and the two Angular forms cannot drift apart.
 */

export const USERNAME_PATTERN = /^[a-z0-9_]{3,30}$/;
export const MOBILE_PATTERN = /^09\d{9}$/;

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_QUANTITY = 20;
export const MIN_QUANTITY = 1;

/** Everyone is here today. The column is free text so they need not stay. */
export const DEFAULT_COMPANY_NAME = 'دیجی‌پی';

export const FIELD_ERRORS = {
  username: 'نام کاربری باید ۳ تا ۳۰ نویسه و فقط شامل حروف انگلیسی، عدد و زیرخط باشد.',
  password: 'رمز عبور باید دست‌کم ۸ نویسه باشد.',
  firstName: 'نام خود را بنویسید.',
  lastName: 'نام خانوادگی خود را بنویسید.',
  mobile: 'شمارهٔ موبایل را به شکل ۰۹۱۲۳۴۵۶۷۸۹ بنویسید.',
  companyName: 'نام شرکت را بنویسید.',
  teamName: 'نام تیم خود را بنویسید.',
  productId: 'محصولی انتخاب نشده است.',
  quantity: 'تعداد فنجان باید بین ۱ تا ۲۰ باشد.',
  notes: 'یادداشت نباید بیشتر از ۵۰۰ نویسه باشد.',
  orderNumber: 'شمارهٔ سفارش را بنویسید.',
  status: 'وضعیت انتخاب‌شده معتبر نیست.',
  reason: 'دلیل نباید بیشتر از ۳۰۰ نویسه باشد.',
  deliveryDate: 'تاریخ تحویل را به شکل ۲۰۲۶-۰۷-۲۷ بنویسید.',
} as const;

/** Receipts: same limits the Supabase bucket used to enforce. */
export const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;
export const RECEIPT_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
] as const;
