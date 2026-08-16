/**
 * Zibal's IPG wire protocol — the whole of it, and nothing else.
 *
 * This file knows what Zibal sends and what its numbers mean. It knows nothing
 * about orders, Prisma or Nest, so the tables below can be read against the
 * published documentation (https://help.zibal.ir/ipg/) line by line without
 * anything of ours in the way.
 *
 * Three numbers travel in Zibal's answers and they are not interchangeable:
 *
 *   `result`  — did the *call* work. 100 means yes. Everything else is a
 *               problem with our request or our account, never with the payer.
 *   `status`  — what happened to the *payment*. 1 is paid-and-verified, 2 is
 *               paid-but-not-yet-verified, and every other value is a way for a
 *               payment not to have happened.
 *   `success` — a convenience flag on the callback query string, and the one
 *               thing here we deliberately do not trust: it reaches us through
 *               the payer's own browser.
 */

/** Money below this is refused by Zibal outright (result 105). */
export const ZIBAL_MIN_AMOUNT_RIAL = 1_000;

/** Zibal prices everything in rial, which is also what Romano stores. */
export const ZIBAL_CURRENCY = 'IRR';

/**
 * How long a payment session is treated as still usable.
 *
 * Zibal expires an unpaid session on its own side; this is the window in which
 * we hand the same `trackId` back instead of opening a second one, so a
 * customer who reloads the page cannot end up paying a session we have stopped
 * watching.
 */
export const ZIBAL_SESSION_TTL_MS = 15 * 60 * 1000;

export interface ZibalRequestPayload {
  merchant: string;
  amount: number;
  callbackUrl: string;
  orderId?: string;
  description?: string;
  mobile?: string;
}

export interface ZibalRequestResponse {
  result: number;
  message?: string;
  trackId?: number | string;
}

export interface ZibalVerifyResponse {
  result: number;
  message?: string;
  status?: number;
  amount?: number;
  refNumber?: number | string;
  cardNumber?: string;
  orderId?: string;
  paidAt?: string;
  description?: string;
}

/** Every answer that means "the call itself was fine". */
export const ZIBAL_RESULT_OK = 100;
/** Verify only: this session was already settled, which is a success for us. */
export const ZIBAL_RESULT_ALREADY_VERIFIED = 201;

/** Payment statuses that mean the money moved. */
export const ZIBAL_STATUS_PAID_VERIFIED = 1;
export const ZIBAL_STATUS_PAID_UNVERIFIED = 2;
/** The payer pressed cancel on the bank's page. */
export const ZIBAL_STATUS_CANCELLED_BY_USER = 3;

/**
 * `result` codes, as Persian sentences.
 *
 * Almost every one of these is *our* fault — a merchant that is not configured,
 * a callback URL the panel will not accept, an amount below the floor. A person
 * paying for coffee can do nothing about any of it, so they are phrased for the
 * screen and the raw code is logged separately for whoever can act on it.
 */
const RESULT_MESSAGES: Record<number, string> = {
  100: 'با موفقیت انجام شد.',
  102: 'درگاه پرداخت پیکربندی نشده است.',
  103: 'درگاه پرداخت غیرفعال است.',
  104: 'اطلاعات درگاه پرداخت معتبر نیست.',
  105: 'مبلغ سفارش برای پرداخت اینترنتی کم است.',
  106: 'نشانی بازگشت درگاه پرداخت درست تنظیم نشده است.',
  107: 'تنظیمات تسهیم درگاه پرداخت درست نیست.',
  108: 'تنظیمات تسهیم درگاه پرداخت درست نیست.',
  109: 'تنظیمات تسهیم درگاه پرداخت درست نیست.',
  110: 'تنظیمات تسهیم درگاه پرداخت درست نیست.',
  111: 'تنظیمات تسهیم درگاه پرداخت درست نیست.',
  112: 'موجودی کیف پول کارمزد درگاه پرداخت کافی نیست.',
  113: 'مبلغ سفارش از سقف مجاز درگاه پرداخت بیشتر است.',
  114: 'کد ملی فرستاده‌شده معتبر نیست.',
  115: 'نشانی سرور در پنل درگاه پرداخت ثبت نشده است.',
  116: 'تنظیمات کارمزد درگاه پرداخت درست نیست.',
  201: 'این پرداخت پیش‌تر تأیید شده است.',
  202: 'این پرداخت انجام نشده یا ناموفق بوده است.',
  203: 'جلسهٔ پرداخت معتبر نیست.',
};

/**
 * `status` codes, as Persian sentences.
 *
 * These *are* about the payer, and several of them are things they can fix by
 * trying again — a mistyped PIN, a card that was not the one they meant. So they
 * say what happened rather than "پرداخت ناموفق بود".
 */
const STATUS_MESSAGES: Record<number, string> = {
  [-1]: 'پرداخت هنوز انجام نشده است.',
  [-2]: 'خطای داخلی درگاه پرداخت.',
  1: 'پرداخت انجام شد.',
  2: 'پرداخت انجام شد و در انتظار تأیید است.',
  3: 'پرداخت را لغو کردید.',
  4: 'شمارهٔ کارت معتبر نیست.',
  5: 'موجودی حساب کافی نیست.',
  6: 'رمز واردشده اشتباه است.',
  7: 'تعداد درخواست‌ها بیش از حد مجاز است.',
  8: 'تعداد پرداخت اینترنتی روزانهٔ شما بیش از حد مجاز است.',
  9: 'مبلغ پرداخت اینترنتی روزانهٔ شما بیش از حد مجاز است.',
  10: 'صادرکنندهٔ کارت معتبر نیست.',
  11: 'خطای سوییچ بانکی. چند لحظه بعد دوباره تلاش کنید.',
  12: 'کارت قابل دسترسی نیست.',
  15: 'این تراکنش استرداد شده است.',
  16: 'این تراکنش در حال استرداد است.',
  18: 'این تراکنش برگشت خورده است.',
  21: 'پذیرندهٔ درگاه پرداخت معتبر نیست.',
};

export function zibalResultMessage(result: number | undefined): string {
  if (result === undefined) return 'پاسخ درگاه پرداخت خوانده نشد.';
  return RESULT_MESSAGES[result] ?? 'درگاه پرداخت پاسخ نامنتظره‌ای داد.';
}

export function zibalStatusMessage(status: number | undefined): string {
  if (status === undefined) return 'وضعیت پرداخت از درگاه خوانده نشد.';
  return STATUS_MESSAGES[status] ?? 'پرداخت کامل نشد.';
}

/** True when Zibal says the money actually moved. */
export function isPaidStatus(status: number | undefined): boolean {
  return status === ZIBAL_STATUS_PAID_VERIFIED || status === ZIBAL_STATUS_PAID_UNVERIFIED;
}

/**
 * True when a verify call settled the session — including the second time.
 *
 * A callback that arrives twice is normal: the payer refreshes, or a proxy
 * retries the redirect. Zibal answers the repeat with 201 rather than 100, and
 * treating that as a failure would flip an already-paid order back to unpaid.
 */
export function isSettledResult(result: number | undefined): boolean {
  return result === ZIBAL_RESULT_OK || result === ZIBAL_RESULT_ALREADY_VERIFIED;
}

/**
 * Zibal's `paidAt` is a local Tehran timestamp with no offset on it —
 * `2018-03-25T23:43:01.053000`. Handing that to `new Date()` reads it in
 * whatever zone the server happens to run in, which on a UTC host silently backs
 * the payment up by three and a half hours.
 *
 * So the offset is supplied when it is missing. Iran has had no daylight saving
 * since 2022, so +03:30 is the whole rule rather than a seasonal guess.
 *
 * Anything unparseable falls back to `fallback` — the moment we settled the
 * payment. A payment time that is a few seconds late is a rounding error; one
 * that is `Invalid Date` breaks the column.
 */
export function parseZibalPaidAt(raw: string | undefined, fallback: Date = new Date()): Date {
  if (!raw) return fallback;

  const trimmed = raw.trim();
  const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/.test(trimmed);
  const parsed = new Date(hasOffset ? trimmed : `${trimmed}+03:30`);

  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

/**
 * Zibal renders `trackId` as a JSON number, which is an int64 and so is already
 * past `Number.MAX_SAFE_INTEGER`'s comfort zone in the examples they publish
 * (`15966442233311` is fine, but nothing promises the next one will be). It is
 * only ever an opaque handle, so it is carried as the digits it arrived as.
 */
export function normalizeTrackId(trackId: number | string | undefined): string | null {
  if (trackId === undefined || trackId === null) return null;
  const text = String(trackId).trim();
  return /^\d{1,20}$/.test(text) ? text : null;
}
