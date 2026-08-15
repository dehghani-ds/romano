/**
 * Field shapes shared by the DTOs, kept in one place so the API, the database
 * CHECK constraints and the two Angular forms cannot drift apart.
 */

export const USERNAME_PATTERN = /^[a-z0-9_]{3,30}$/;
export const MOBILE_PATTERN = /^09\d{9}$/;

/** `romano`, `cafe-latte` — lowercase, digits, single hyphens, never at an end. */
export const PRODUCT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const CURRENCY_PATTERN = /^[A-Z]{3}$/;

export const MIN_PASSWORD_LENGTH = 8;
/** Per basket line, not per order — twenty coffees *and* twenty cookies is fine. */
export const MAX_QUANTITY = 20;
export const MIN_QUANTITY = 1;
/** A basket holds one line per product; this caps how many distinct products. */
export const MAX_BASKET_LINES = 20;
export const MAX_UNIT_LENGTH = 16;

/**
 * `products.price` is `Decimal(12, 2)`, so the column itself stops at
 * 9,999,999,999.99. The cap here is two orders of magnitude below that: it is a
 * typo guard for a price typed in rial, not the column's limit.
 */
export const MAX_PRODUCT_PRICE = 100_000_000;
export const MIN_PRODUCT_PRICE = 0;

/**
 * An expense is not a price. A product costs what a cup costs; an expense can be
 * a whole espresso machine, so the typo guard sits an order of magnitude higher
 * — still far below what `Decimal(12, 2)` would take.
 *
 * The minimum is strictly above zero, unlike a product's: a free product is a
 * real thing to sell, a free expense is a row someone forgot to fill in.
 */
export const MAX_EXPENSE_AMOUNT = 1_000_000_000;
export const MIN_EXPENSE_AMOUNT = 0.01;
export const MAX_EXPENSE_TITLE_LENGTH = 120;
export const MAX_EXPENSE_NOTE_LENGTH = 500;

/** Everyone is here today. The column is free text so they need not stay. */
export const DEFAULT_COMPANY_NAME = 'دیجی‌پی';

/** Matches the `products.unit` column default. */
export const DEFAULT_UNIT = 'فنجان';

export const FIELD_ERRORS = {
  username: 'نام کاربری باید ۳ تا ۳۰ نویسه و فقط شامل حروف انگلیسی، عدد و زیرخط باشد.',
  password: 'رمز عبور باید دست‌کم ۸ نویسه باشد.',
  firstName: 'نام خود را بنویسید.',
  lastName: 'نام خانوادگی خود را بنویسید.',
  mobile: 'شمارهٔ موبایل را به شکل ۰۹۱۲۳۴۵۶۷۸۹ بنویسید.',
  companyName: 'نام شرکت را بنویسید.',
  teamName: 'نام تیم خود را بنویسید.',
  productId: 'محصولی انتخاب نشده است.',
  quantity: 'تعداد هر مورد باید بین ۱ تا ۲۰ باشد.',
  basketEmpty: 'سبد شما خالی است. دست‌کم یک محصول انتخاب کنید.',
  basketTooManyLines: 'در هر سفارش حداکثر ۲۰ محصول متفاوت می‌گنجد.',
  notes: 'یادداشت نباید بیشتر از ۵۰۰ نویسه باشد.',
  orderNumber: 'شمارهٔ سفارش را بنویسید.',
  status: 'وضعیت انتخاب‌شده معتبر نیست.',
  reason: 'دلیل نباید بیشتر از ۳۰۰ نویسه باشد.',
  deliveryDate: 'تاریخ تحویل را به شکل ۲۰۲۶-۰۷-۲۷ بنویسید.',
  productSlug:
    'شناسهٔ محصول باید با حروف کوچک انگلیسی، عدد و خط تیره نوشته شود — مثل romano یا cafe-latte.',
  productName: 'نام محصول را بنویسید (۱ تا ۸۰ نویسه).',
  productDescription: 'توضیح محصول نباید بیشتر از ۵۰۰ نویسه باشد.',
  productPrice: 'قیمت را به ریال و به صورت عدد بنویسید — بیشتر از صفر و کمتر از ۱۰۰٬۰۰۰٬۰۰۰.',
  productUnit: 'واحد شمارش را کوتاه بنویسید — مثل فنجان، عدد یا بسته.',
  productCurrency: 'واحد پول باید یک کد سه‌حرفی مثل IRR باشد.',
  productImageUrl: 'نشانی تصویر باید یک آدرس کامل با http یا https باشد.',
  productSortOrder: 'ترتیب نمایش باید عددی بین ۰ تا ۹۹۹ باشد.',
  expenseTitle: 'بابت چه چیزی خرج شد؟ کوتاه بنویسید (۱ تا ۱۲۰ نویسه).',
  expenseAmount: 'مبلغ را به ریال و به صورت عدد بنویسید — بیشتر از صفر و کمتر از ۱٬۰۰۰٬۰۰۰٬۰۰۰.',
  expenseCategory: 'دستهٔ انتخاب‌شده معتبر نیست.',
  expenseSpentAt: 'تاریخ خرج را به شکل ۲۰۲۶-۰۸-۱۵ بنویسید.',
  expenseNote: 'توضیح نباید بیشتر از ۵۰۰ نویسه باشد.',
  expensePaidBy: 'پرداخت‌کننده انتخاب نشده است.',
  expenseCurrency: 'واحد پول باید یک کد سه‌حرفی مثل IRR باشد.',
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
