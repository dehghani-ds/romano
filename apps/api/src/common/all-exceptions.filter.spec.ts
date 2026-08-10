import { describe, expect, it } from 'vitest';

import { stripFieldPath } from './all-exceptions.filter';

/**
 * Nested DTO validation started prefixing complaints with a field path once the
 * basket became `items[]`. The reader must never see it.
 */
describe('stripFieldPath', () => {
  it('removes the path Nest glues onto a nested field complaint', () => {
    expect(stripFieldPath('items.0.تعداد هر مورد باید بین ۱ تا ۲۰ باشد.')).toBe(
      'تعداد هر مورد باید بین ۱ تا ۲۰ باشد.',
    );
  });

  it('removes a deeper path too', () => {
    expect(stripFieldPath('items.12.productId.محصولی انتخاب نشده است.')).toBe(
      'محصولی انتخاب نشده است.',
    );
  });

  it('leaves a plain Persian message untouched', () => {
    const message = 'سبد شما خالی است. دست‌کم یک محصول انتخاب کنید.';
    expect(stripFieldPath(message)).toBe(message);
  });

  it('leaves a Latin message alone rather than eating its first word', () => {
    expect(stripFieldPath('items.0.must be a number')).toBe('items.0.must be a number');
  });

  it('does not strip a Persian sentence that merely contains a dot', () => {
    const message = 'قیمت را بنویسید. مثلاً ۱۲۹۹۰۰.';
    expect(stripFieldPath(message)).toBe(message);
  });
});
