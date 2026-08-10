import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { UpdateProductDto } from './dto';

/**
 * `UpdateProductDto` carries the whole meaning of a PATCH, so the three cases
 * that are easy to get wrong are pinned here rather than left to the endpoint:
 * absent ≠ empty ≠ null.
 *
 * Mirrors the global pipe in `main.ts` — `transform`, and the same class.
 */
function parse(body: Record<string, unknown>) {
  const dto = plainToInstance(UpdateProductDto, body);
  return { dto, errors: validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }) };
}

function fieldsIn(errors: ReturnType<typeof parse>['errors']): string[] {
  return errors.map((error) => error.property);
}

describe('UpdateProductDto', () => {
  it('accepts an empty patch — nothing changed is not an error', () => {
    const { errors } = parse({});
    expect(errors).toEqual([]);
  });

  it('leaves an absent field absent rather than undefined-in-the-object', () => {
    const { dto } = parse({ name: 'لاته' });
    expect(dto.name).toBe('لاته');
    expect(dto.price).toBeUndefined();
    expect(dto.isActive).toBeUndefined();
  });

  it('trims what it is given', () => {
    const { dto } = parse({ name: '  لاته  ', unit: ' عدد ' });
    expect(dto.name).toBe('لاته');
    expect(dto.unit).toBe('عدد');
  });

  it('reads an empty description or image field as "clear it"', () => {
    const { dto, errors } = parse({ description: '   ', imageUrl: '' });
    expect(errors).toEqual([]);
    expect(dto.description).toBeNull();
    expect(dto.imageUrl).toBeNull();
  });

  it('takes an explicit null on the two nullable columns', () => {
    const { dto, errors } = parse({ description: null, imageUrl: null });
    expect(errors).toEqual([]);
    expect(dto.description).toBeNull();
    expect(dto.imageUrl).toBeNull();
  });

  it('refuses null where the column is NOT NULL', () => {
    // `@IsOptional()` would have let every one of these through.
    expect(fieldsIn(parse({ name: null }).errors)).toEqual(['name']);
    expect(fieldsIn(parse({ price: null }).errors)).toEqual(['price']);
    expect(fieldsIn(parse({ unit: null }).errors)).toEqual(['unit']);
    expect(fieldsIn(parse({ isActive: null }).errors)).toEqual(['isActive']);
    expect(fieldsIn(parse({ sortOrder: null }).errors)).toEqual(['sortOrder']);
    expect(fieldsIn(parse({ currency: null }).errors)).toEqual(['currency']);
  });

  it('holds the same limits as the add form', () => {
    expect(fieldsIn(parse({ name: '' }).errors)).toEqual(['name']);
    expect(fieldsIn(parse({ price: -1 }).errors)).toEqual(['price']);
    expect(fieldsIn(parse({ price: 100_000_001 }).errors)).toEqual(['price']);
    expect(fieldsIn(parse({ sortOrder: 1000 }).errors)).toEqual(['sortOrder']);
    expect(fieldsIn(parse({ currency: 'irr' }).errors)).toEqual(['currency']);
    expect(fieldsIn(parse({ imageUrl: 'example.com/a.png' }).errors)).toEqual(['imageUrl']);
  });

  it('has no slug — the identity in a URL does not change', () => {
    const { errors } = parse({ slug: 'latte' });
    expect(fieldsIn(errors)).toEqual(['slug']);
  });
});
