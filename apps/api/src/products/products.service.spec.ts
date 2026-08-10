import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { Prisma } from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { CreateProductDto } from './dto';
import { ProductsService } from './products.service';

/**
 * The rules that matter when a product is added: the slug is unique, the price
 * reaches the column as a Decimal, and the optional fields fall back to the
 * defaults rather than to `undefined`.
 */

type ProductRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price: Prisma.Decimal;
  currency: string;
  unit: string;
  imageUrl: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

function row(overrides: Partial<ProductRow> = {}): ProductRow {
  return {
    id: '0192f5a0-0000-7000-8000-000000000000',
    slug: 'romano',
    name: 'رومانو',
    description: null,
    price: new Prisma.Decimal(129900),
    currency: 'IRR',
    unit: 'فنجان',
    imageUrl: null,
    isActive: true,
    sortOrder: 0,
    createdAt: new Date('2026-08-10T06:00:00.000Z'),
    updatedAt: new Date('2026-08-10T06:00:00.000Z'),
    ...overrides,
  };
}

function makeService() {
  const findUnique = vi.fn((_args: unknown): Promise<ProductRow | null> => Promise.resolve(null));
  const findMany = vi.fn((_args: unknown): Promise<ProductRow[]> => Promise.resolve([]));
  const create = vi.fn(({ data }: { data: Record<string, unknown> }): Promise<ProductRow> =>
    Promise.resolve(row(data as Partial<ProductRow>)),
  );

  const prisma = { product: { findUnique, findMany, create } } as unknown as PrismaService;
  return { service: new ProductsService(prisma), findUnique, findMany, create };
}

const minimal: CreateProductDto = { slug: 'latte', name: 'لاته', price: 149900 };

describe('ProductsService.create', () => {
  it('writes the product and returns it in the public shape', async () => {
    const { service, create } = makeService();

    const product = await service.create({ ...minimal });

    expect(create).toHaveBeenCalledTimes(1);
    const { data } = create.mock.calls[0][0];
    expect(data['slug']).toBe('latte');
    expect(data['name']).toBe('لاته');
    // Decimal, not a float — the column is Decimal(12, 2).
    expect(data['price']).toBeInstanceOf(Prisma.Decimal);
    expect((data['price'] as Prisma.Decimal).toNumber()).toBe(149900);

    // `price` comes back as a number the UI can format.
    expect(product.price).toBe(149900);
    expect(typeof product.price).toBe('number');
  });

  it('applies the column defaults for everything optional', async () => {
    const { service, create } = makeService();

    await service.create({ ...minimal });

    const { data } = create.mock.calls[0][0];
    expect(data['currency']).toBe('IRR');
    expect(data['unit']).toBe('فنجان');
    expect(data['isActive']).toBe(true);
    expect(data['sortOrder']).toBe(0);
    expect(data['description']).toBeNull();
    expect(data['imageUrl']).toBeNull();
  });

  it('keeps the values it was given', async () => {
    const { service, create } = makeService();

    await service.create({
      ...minimal,
      description: 'شیر و اسپرسو',
      currency: 'USD',
      unit: 'عدد',
      imageUrl: 'https://cdn.example.com/latte.png',
      isActive: false,
      sortOrder: 7,
    });

    const { data } = create.mock.calls[0][0];
    expect(data['description']).toBe('شیر و اسپرسو');
    expect(data['currency']).toBe('USD');
    expect(data['unit']).toBe('عدد');
    expect(data['imageUrl']).toBe('https://cdn.example.com/latte.png');
    expect(data['isActive']).toBe(false);
    expect(data['sortOrder']).toBe(7);
  });

  it('rejects a slug that is already taken, without writing', async () => {
    const { service, findUnique, create } = makeService();
    findUnique.mockResolvedValue(row({ slug: 'latte' }));

    await expect(service.create({ ...minimal })).rejects.toBeInstanceOf(ConflictException);
    expect(create).not.toHaveBeenCalled();
  });

  it('an inactive product still holds its slug', async () => {
    const { service, findUnique } = makeService();
    findUnique.mockResolvedValue(row({ slug: 'latte', isActive: false }));

    await expect(service.create({ ...minimal })).rejects.toBeInstanceOf(ConflictException);
  });

  it('turns the unique-index race into the same conflict', async () => {
    const { service, create } = makeService();
    create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['slug'] },
      }),
    );

    await expect(service.create({ ...minimal })).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not swallow an unrelated database failure', async () => {
    const { service, create } = makeService();
    const boom = new Error('connection reset');
    create.mockRejectedValue(boom);

    await expect(service.create({ ...minimal })).rejects.toBe(boom);
  });
});

describe('ProductsService.listAll', () => {
  it('includes inactive products, unlike the public list', async () => {
    const { service, findMany } = makeService();
    findMany.mockResolvedValue([row({ slug: 'romano' }), row({ slug: 'latte', isActive: false })]);

    const products = await service.listAll();

    expect(findMany.mock.calls[0][0]).not.toHaveProperty('where');
    expect(products.map((p) => p.slug)).toEqual(['romano', 'latte']);
    expect(products[1].isActive).toBe(false);
  });
});
