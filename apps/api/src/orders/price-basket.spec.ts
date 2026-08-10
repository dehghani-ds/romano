import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { Prisma } from '../generated/prisma/client';
import { priceBasket, type PricedProduct } from './orders.service';

/**
 * Basket pricing. The rule that matters is that money comes from `products`
 * and never from the request — everything else here is the refusals.
 */

const romano: PricedProduct = {
  id: 'p-romano',
  price: new Prisma.Decimal(129900),
  currency: 'IRR',
  unit: 'فنجان',
  isActive: true,
};

const cookie: PricedProduct = {
  id: 'p-cookie',
  price: new Prisma.Decimal(45000),
  currency: 'IRR',
  unit: 'عدد',
  isActive: true,
};

const catalog = [romano, cookie];

describe('priceBasket', () => {
  it('prices a single line from the product row', () => {
    const basket = priceBasket([{ productId: 'p-romano', quantity: 2 }], catalog);

    expect(basket.total.toNumber()).toBe(259800);
    expect(basket.currency).toBe('IRR');
    expect(basket.lines).toHaveLength(1);
    expect(basket.lines[0].unitPrice.toNumber()).toBe(129900);
    expect(basket.lines[0].unit).toBe('فنجان');
  });

  it('adds up a mixed basket and keeps each line its own unit', () => {
    const basket = priceBasket(
      [
        { productId: 'p-romano', quantity: 2 },
        { productId: 'p-cookie', quantity: 3 },
      ],
      catalog,
    );

    // 2 × 129,900 + 3 × 45,000
    expect(basket.total.toNumber()).toBe(394800);
    expect(basket.lines.map((line) => line.unit)).toEqual(['فنجان', 'عدد']);
    expect(basket.lines.map((line) => line.quantity)).toEqual([2, 3]);
  });

  it('ignores any price the caller tries to smuggle in', () => {
    const basket = priceBasket(
      [{ productId: 'p-romano', quantity: 1, unitPrice: 1, price: 1 } as never],
      catalog,
    );

    expect(basket.total.toNumber()).toBe(129900);
    expect(basket.lines[0].unitPrice.toNumber()).toBe(129900);
  });

  it('refuses an empty basket', () => {
    expect(() => priceBasket([], catalog)).toThrow(BadRequestException);
  });

  it('refuses the same product twice — order_items is unique per product', () => {
    expect(() =>
      priceBasket(
        [
          { productId: 'p-romano', quantity: 1 },
          { productId: 'p-romano', quantity: 2 },
        ],
        catalog,
      ),
    ).toThrow(BadRequestException);
  });

  it('refuses a product that is not in the catalog', () => {
    expect(() => priceBasket([{ productId: 'p-ghost', quantity: 1 }], catalog)).toThrow(
      BadRequestException,
    );
  });

  it('refuses an inactive product, even when it exists', () => {
    const retired: PricedProduct = { ...cookie, isActive: false };
    expect(() => priceBasket([{ productId: 'p-cookie', quantity: 1 }], [romano, retired])).toThrow(
      BadRequestException,
    );
  });

  it('refuses to mix currencies in one order', () => {
    const dollarCookie: PricedProduct = { ...cookie, currency: 'USD' };

    expect(() =>
      priceBasket(
        [
          { productId: 'p-romano', quantity: 1 },
          { productId: 'p-cookie', quantity: 1 },
        ],
        [romano, dollarCookie],
      ),
    ).toThrow(BadRequestException);
  });

  it('is exact on money — no floating point drift over many lines', () => {
    const odd: PricedProduct = { ...romano, id: 'p-odd', price: new Prisma.Decimal('0.10') };
    const basket = priceBasket([{ productId: 'p-odd', quantity: 3 }], [odd]);

    // 0.1 * 3 is 0.30000000000000004 as a float; Decimal keeps it 0.30.
    expect(basket.total.toString()).toBe('0.3');
  });
});
