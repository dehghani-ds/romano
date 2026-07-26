import { HttpErrorResponse } from '@angular/common/http';

import { environment } from '../../environments/environment';

export const API_BASE = environment.apiBaseUrl;

export function apiUrl(path: string): string {
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * Turns anything thrown by an HTTP call into a sentence a person can read.
 *
 * The API writes its own Persian copy — every deliberate failure comes back as
 * `{ message }` already phrased for the reader — so the common case here is to
 * pass it straight through. What is left is the handful of situations the
 * server never got to answer.
 */
export function toUserMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return 'به سرور وصل نشدیم. اتصال اینترنت خود را بررسی کنید.';
    }

    const message = (error.error as { message?: unknown } | null)?.message;
    if (typeof message === 'string' && message.trim()) return message;

    if (error.status === 404) return 'چیزی که دنبالش بودید پیدا نشد.';
    if (error.status === 429) return 'درخواست‌های زیادی فرستادید. کمی صبر کنید.';
    if (error.status >= 500) return 'سرور پاسخ نداد. چند لحظه بعد دوباره تلاش کنید.';
  }

  if (error instanceof Error && error.message) return error.message;
  return 'خطای غیرمنتظره‌ای رخ داد. لطفاً دوباره تلاش کنید.';
}
