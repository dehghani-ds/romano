import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it } from 'vitest';

import { apiUrl, toUserMessage } from './api';

describe('apiUrl', () => {
  it('joins with or without a leading slash', () => {
    expect(apiUrl('/products')).toBe('/api/products');
    expect(apiUrl('products')).toBe('/api/products');
  });
});

describe('toUserMessage', () => {
  const httpError = (status: number, body: unknown) =>
    new HttpErrorResponse({ status, error: body });

  it('passes the API message through untouched', () => {
    // The API writes its own Persian copy; re-wording it here would be a bug.
    const message = 'فقط سفارشی که هنوز در انتظار است را می‌توانید خودتان لغو کنید.';
    expect(toUserMessage(httpError(400, { message }))).toBe(message);
  });

  it('explains an unreachable server rather than showing status 0', () => {
    expect(toUserMessage(httpError(0, null))).toContain('اتصال اینترنت');
  });

  it('falls back to Persian for a bodyless failure', () => {
    expect(toUserMessage(httpError(404, null))).toBe('چیزی که دنبالش بودید پیدا نشد.');
    expect(toUserMessage(httpError(429, null))).toContain('درخواست‌های زیادی');
    expect(toUserMessage(httpError(503, null))).toContain('سرور پاسخ نداد');
  });

  it('ignores a blank message and uses the status fallback', () => {
    expect(toUserMessage(httpError(404, { message: '   ' }))).toBe('چیزی که دنبالش بودید پیدا نشد.');
  });

  it('handles a plain Error and an unknown value', () => {
    expect(toUserMessage(new Error('چیزی خراب شد'))).toBe('چیزی خراب شد');
    expect(toUserMessage(undefined)).toContain('خطای غیرمنتظره');
  });
});
