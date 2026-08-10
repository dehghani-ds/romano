/**
 * Shared formatting helpers. Dates are never shown as a bare ISO string.
 *
 * Everything a person reads is Persian: `fa-IR` gives Persian digits and, for
 * dates, the Jalali calendar — so `2026-07-26` is shown as `۴ مرداد`, not a
 * Gregorian date transliterated into Persian.
 *
 * The wire format never changes: `delivery_date` is still a Gregorian
 * `YYYY-MM-DD` string in the database and in every request.
 */

const LOCALE = 'fa-IR';

const WEEKDAY_DATE = new Intl.DateTimeFormat(LOCALE, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

const DATE_TIME = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});

const NUMBER = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });

/** `2026-07-26` → `یکشنبه ۴ مرداد`, with `فردا · ` prefixed when it applies. */
export function formatDeliveryDate(isoDate: string): string {
  const date = parseDateOnly(isoDate);
  const label = WEEKDAY_DATE.format(date);

  const today = startOfToday();
  const diffDays = Math.round((date.getTime() - today.getTime()) / 86_400_000);

  if (diffDays === 0) return `امروز · ${label}`;
  if (diffDays === 1) return `فردا · ${label}`;
  if (diffDays === -1) return `دیروز · ${label}`;
  return label;
}

export function formatDateTime(iso: string): string {
  return DATE_TIME.format(new Date(iso));
}

/** Tomorrow as `YYYY-MM-DD`, in the browser's own timezone. */
export function tomorrowIso(): string {
  const d = startOfToday();
  d.setDate(d.getDate() + 1);
  return toIsoDate(d);
}

export function todayIso(): string {
  return toIsoDate(startOfToday());
}

export function toIsoDate(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Digits in Persian, e.g. `20` → `۲۰`. */
export function formatNumber(value: number): string {
  return NUMBER.format(value);
}

/** Amounts are whole units — no fractional rial. */
export function formatMoney(amount: number, currency = 'IRR'): string {
  const value = NUMBER.format(amount);
  return currency === 'IRR' ? `${value} ریال` : `${value} ${currency}`;
}

/** The unit a product is counted in when it does not name its own. */
export const DEFAULT_UNIT = 'فنجان';

/**
 * `۳ فنجان`, `۵ عدد`. Persian has no plural form for a counted noun, so the
 * unit is written exactly as the product stores it.
 *
 * This replaced `pluralCups`, which assumed every product was coffee — it is
 * not, now that a cookie can sit in the same basket.
 */
export function formatQuantity(count: number, unit: string = DEFAULT_UNIT): string {
  return `${NUMBER.format(count)} ${unit || DEFAULT_UNIT}`;
}

/**
 * A basket in words: `۲ فنجان رومانو · ۳ عدد کوکی`. Falls back to a bare count
 * when the lines share one unit, which is the common single-product case.
 */
export function formatQuantityBreakdown(
  lines: readonly { quantity: number; unit?: string | null }[],
): string {
  if (lines.length === 0) return formatQuantity(0);

  const units = new Set(lines.map((line) => line.unit || DEFAULT_UNIT));
  const total = lines.reduce((sum, line) => sum + line.quantity, 0);
  if (units.size === 1) return formatQuantity(total, [...units][0]);

  const byUnit = new Map<string, number>();
  for (const line of lines) {
    const unit = line.unit || DEFAULT_UNIT;
    byUnit.set(unit, (byUnit.get(unit) ?? 0) + line.quantity);
  }
  return [...byUnit].map(([unit, count]) => formatQuantity(count, unit)).join(' · ');
}

/**
 * Parse `YYYY-MM-DD` as a local date. `new Date('2026-07-26')` parses as UTC
 * midnight, which lands on the previous day west of Greenwich.
 */
function parseDateOnly(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
