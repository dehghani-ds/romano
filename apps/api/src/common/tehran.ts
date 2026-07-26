/**
 * Romano thinks in Tehran days. "Tomorrow" has to mean tomorrow for the person
 * ordering, not for whatever timezone the server happens to run in, and the
 * order number carries a date prefix that must roll over at Tehran midnight.
 *
 * Dates are handled as plain `YYYY-MM-DD` strings (Gregorian — the Jalali
 * rendering is the client's job) and only become `Date` at the database edge,
 * where a `date` column stores them at UTC midnight.
 */

const TEHRAN = 'Asia/Tehran';

// 'en-CA' formats as YYYY-MM-DD, which is exactly the shape we want.
const isoFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TEHRAN,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Today in Tehran, as `YYYY-MM-DD`. */
export function tehranToday(now: Date = new Date()): string {
  return isoFormatter.format(now);
}

/** Tomorrow in Tehran — the default delivery day. */
export function tehranTomorrow(now: Date = new Date()): string {
  return addDays(tehranToday(now), 1);
}

export function addDays(iso: string, days: number): string {
  const date = isoToDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return dateToIso(date);
}

/** `YYYY-MM-DD` → the `Date` a Postgres `date` column round-trips. */
export function isoToDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export function dateToIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** `2026-07-26` → `260726`, the order-number prefix. */
export function isoToYymmdd(iso: string): string {
  return iso.slice(2).replace(/-/g, '');
}

/** True when `iso` is strictly after today in Tehran. */
export function isFutureDay(iso: string, now: Date = new Date()): boolean {
  return iso > tehranToday(now);
}
