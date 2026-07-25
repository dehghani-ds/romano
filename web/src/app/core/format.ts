/** Shared formatting helpers. Dates are never shown as a bare ISO string. */

const WEEKDAY_DATE = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

const DATE_TIME = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

/** `2026-07-26` → `Sun 26 Jul`, with `Tomorrow · ` prefixed when it applies. */
export function formatDeliveryDate(isoDate: string): string {
  const date = parseDateOnly(isoDate);
  const label = WEEKDAY_DATE.format(date);

  const today = startOfToday();
  const diffDays = Math.round((date.getTime() - today.getTime()) / 86_400_000);

  if (diffDays === 0) return `Today · ${label}`;
  if (diffDays === 1) return `Tomorrow · ${label}`;
  if (diffDays === -1) return `Yesterday · ${label}`;
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

/** Amounts are whole units — no fractional rial. */
export function formatMoney(amount: number, currency = 'IRR'): string {
  const value = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(amount);
  return `${value} ${currency}`;
}

export function pluralCups(count: number): string {
  return count === 1 ? '1 cup' : `${count} cups`;
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
