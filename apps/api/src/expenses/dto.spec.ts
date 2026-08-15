import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { CreateExpenseDto, UpdateExpenseDto } from './dto';

/**
 * `UpdateExpenseDto` carries the whole meaning of a PATCH — absent ≠ empty ≠
 * null — so the cases that are easy to get wrong are pinned here rather than
 * left to the endpoint.
 *
 * Mirrors the global pipe in `main.ts`: `transform`, and the same class.
 */
function parse<T extends object>(cls: new () => T, body: Record<string, unknown>) {
  const dto = plainToInstance(cls, body);
  return { dto, errors: validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }) };
}

function fieldsIn(errors: ReturnType<typeof parse>['errors']): string[] {
  return errors.map((error) => error.property);
}

describe('CreateExpenseDto', () => {
  it('needs only a title and an amount — the rest has defaults', () => {
    const { dto, errors } = parse(CreateExpenseDto, { title: 'خرید دان قهوه', amount: 2500000 });
    expect(errors).toEqual([]);
    expect(dto.category).toBeUndefined();
    expect(dto.spentAt).toBeUndefined();
    expect(dto.paidById).toBeUndefined();
  });

  it('trims the title and reads an empty note as "not given"', () => {
    const { dto } = parse(CreateExpenseDto, {
      title: '  خرید دان قهوه  ',
      amount: 2500000,
      note: '   ',
    });
    expect(dto.title).toBe('خرید دان قهوه');
    expect(dto.note).toBeUndefined();
  });

  it('holds the limits the form promises', () => {
    const base = { title: 'خرید', amount: 1000 };
    expect(fieldsIn(parse(CreateExpenseDto, { ...base, title: '' }).errors)).toEqual(['title']);
    expect(fieldsIn(parse(CreateExpenseDto, { ...base, title: 'ب'.repeat(121) }).errors)).toEqual([
      'title',
    ]);
    // Zero is not an expense — unlike a product, which may legitimately be free.
    expect(fieldsIn(parse(CreateExpenseDto, { ...base, amount: 0 }).errors)).toEqual(['amount']);
    expect(fieldsIn(parse(CreateExpenseDto, { ...base, amount: -1 }).errors)).toEqual(['amount']);
    expect(fieldsIn(parse(CreateExpenseDto, { ...base, amount: 1_000_000_001 }).errors)).toEqual([
      'amount',
    ]);
    expect(fieldsIn(parse(CreateExpenseDto, { ...base, category: 'rent' }).errors)).toEqual([
      'category',
    ]);
    expect(fieldsIn(parse(CreateExpenseDto, { ...base, spentAt: '15/08/2026' }).errors)).toEqual([
      'spentAt',
    ]);
    expect(fieldsIn(parse(CreateExpenseDto, { ...base, paidById: 'ali' }).errors)).toEqual([
      'paidById',
    ]);
    expect(fieldsIn(parse(CreateExpenseDto, { ...base, currency: 'irr' }).errors)).toEqual([
      'currency',
    ]);
  });

  it('takes the four categories the ledger knows', () => {
    for (const category of ['coffee', 'supplies', 'equipment', 'other']) {
      const { errors } = parse(CreateExpenseDto, { title: 'خرید', amount: 1000, category });
      expect(errors).toEqual([]);
    }
  });
});

describe('UpdateExpenseDto', () => {
  it('accepts an empty patch — nothing changed is not an error', () => {
    const { errors } = parse(UpdateExpenseDto, {});
    expect(errors).toEqual([]);
  });

  it('leaves an absent field absent rather than undefined-in-the-object', () => {
    const { dto } = parse(UpdateExpenseDto, { title: 'اصلاح شد' });
    expect(dto.title).toBe('اصلاح شد');
    expect(dto.amount).toBeUndefined();
    expect(dto.paidById).toBeUndefined();
  });

  it('reads an empty note field as "clear it"', () => {
    const { dto, errors } = parse(UpdateExpenseDto, { note: '   ' });
    expect(errors).toEqual([]);
    expect(dto.note).toBeNull();
  });

  it('takes an explicit null on the one nullable column', () => {
    const { dto, errors } = parse(UpdateExpenseDto, { note: null });
    expect(errors).toEqual([]);
    expect(dto.note).toBeNull();
  });

  it('refuses null where the column is NOT NULL', () => {
    // `@IsOptional()` would have let every one of these through.
    expect(fieldsIn(parse(UpdateExpenseDto, { title: null }).errors)).toEqual(['title']);
    expect(fieldsIn(parse(UpdateExpenseDto, { amount: null }).errors)).toEqual(['amount']);
    expect(fieldsIn(parse(UpdateExpenseDto, { category: null }).errors)).toEqual(['category']);
    expect(fieldsIn(parse(UpdateExpenseDto, { spentAt: null }).errors)).toEqual(['spentAt']);
    expect(fieldsIn(parse(UpdateExpenseDto, { paidById: null }).errors)).toEqual(['paidById']);
    expect(fieldsIn(parse(UpdateExpenseDto, { currency: null }).errors)).toEqual(['currency']);
  });

  /**
   * Unlike a product's slug, every field of an expense is editable: the payer
   * included, because filing a receipt under the wrong colleague is exactly the
   * mistake this endpoint exists to undo.
   */
  it('lets the payer be corrected', () => {
    const { dto, errors } = parse(UpdateExpenseDto, {
      paidById: '0192f5a0-0000-7000-8000-00000000000b',
    });
    expect(errors).toEqual([]);
    expect(dto.paidById).toBe('0192f5a0-0000-7000-8000-00000000000b');
  });
});
