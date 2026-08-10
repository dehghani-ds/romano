import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { Prisma } from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { CreateProductDto, UpdateProductDto } from './dto';
import { ProductsService } from './products.service';

/**
 * The rules that matter when a product is added: the slug is unique, the price
 * reaches the column as a Decimal, and the optional fields fall back to the
 * defaults rather than to `undefined`.
 *
 * And when one is edited: only what was sent is written, `null` clears the two
 * columns that allow it, and the slug is not in the picture at all.
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
  const update = vi.fn(({ data }: { data: Record<string, unknown> }): Promise<ProductRow> =>
    Promise.resolve(row(data as Partial<ProductRow>)),
  );

  const prisma = { product: { findUnique, findMany, create, update } } as unknown as PrismaService;
  return { service: new ProductsService(prisma), findUnique, findMany, create, update };
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

describe('ProductsService.update', () => {
  const id = '0192f5a0-0000-7000-8000-000000000000';

  it('writes only the fields that were sent', async () => {
    const { service, findUnique, update } = makeService();
    findUnique.mockResolvedValue(row());

    await service.update(id, { name: 'رومانوی ویژه' });

    const { data } = update.mock.calls[0][0];
    expect(Object.keys(data)).toEqual(['name']);
    expect(data['name']).toBe('رومانوی ویژه');
  });

  it('sends the new price as a Decimal and returns it as a number', async () => {
    const { service, findUnique, update } = makeService();
    findUnique.mockResolvedValue(row());

    const product = await service.update(id, { price: 139900 });

    const { data } = update.mock.calls[0][0];
    expect(data['price']).toBeInstanceOf(Prisma.Decimal);
    expect((data['price'] as Prisma.Decimal).toNumber()).toBe(139900);
    expect(product.price).toBe(139900);
  });

  it('clears description and imageUrl when they come through as null', async () => {
    const { service, findUnique, update } = makeService();
    findUnique.mockResolvedValue(row({ description: 'قدیمی', imageUrl: 'https://x/y.png' }));

    await service.update(id, { description: null, imageUrl: null });

    const { data } = update.mock.calls[0][0];
    expect(data['description']).toBeNull();
    expect(data['imageUrl']).toBeNull();
  });

  it('takes a product out of the shop without touching anything else', async () => {
    const { service, findUnique, update } = makeService();
    findUnique.mockResolvedValue(row());

    await service.update(id, { isActive: false });

    const { data } = update.mock.calls[0][0];
    expect(Object.keys(data)).toEqual(['isActive']);
    expect(data['isActive']).toBe(false);
  });

  it('never writes the slug, even by accident', async () => {
    const { service, findUnique, update } = makeService();
    findUnique.mockResolvedValue(row());

    // The DTO has no `slug` and the whitelist strips it before this point; the
    // cast is here to pin that the service copies named fields rather than
    // spreading whatever it was handed.
    await service.update(id, { name: 'لاته', slug: 'latte' } as UpdateProductDto);

    const { data } = update.mock.calls[0][0];
    expect(data).not.toHaveProperty('slug');
  });

  it('does not write at all when the patch is empty', async () => {
    const { service, findUnique, update } = makeService();
    findUnique.mockResolvedValue(row({ name: 'رومانو' }));

    const product = await service.update(id, {});

    expect(update).not.toHaveBeenCalled();
    expect(product.name).toBe('رومانو');
  });

  it('answers 404 for a product that is not there', async () => {
    const { service, findUnique, update } = makeService();
    findUnique.mockResolvedValue(null);

    await expect(service.update(id, { name: 'لاته' })).rejects.toBeInstanceOf(NotFoundException);
    expect(update).not.toHaveBeenCalled();
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
