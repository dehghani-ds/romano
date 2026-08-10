import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { MESSAGES } from '../common/messages';
import { DEFAULT_UNIT } from '../common/validation';
import { Prisma, type Product } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateProductDto, UpdateProductDto } from './dto';

export interface PublicProduct {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  unit: string;
  imageUrl: string | null;
  isActive: boolean;
  sortOrder: number;
}

export function toPublicProduct(product: Product): PublicProduct {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    description: product.description,
    // Decimal is exact in the database; the UI only ever formats it.
    price: product.price.toNumber(),
    currency: product.currency,
    unit: product.unit,
    imageUrl: product.imageUrl,
    isActive: product.isActive,
    sortOrder: product.sortOrder,
  };
}

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async listActive(): Promise<PublicProduct[]> {
    const products = await this.prisma.product.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return products.map(toPublicProduct);
  }

  /** Admin view: inactive products are still products, and still editable. */
  async listAll(): Promise<PublicProduct[]> {
    const products = await this.prisma.product.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return products.map(toPublicProduct);
  }

  /**
   * Adding a product is a plain insert — there is no lifecycle here, nothing to
   * keep in step, and nothing an order depends on until someone orders it. The
   * one thing that has to hold is the unique slug, which the database owns; the
   * pre-check exists so the admin gets a Persian sentence instead of a 500.
   */
  async create(dto: CreateProductDto): Promise<PublicProduct> {
    const existing = await this.prisma.product.findUnique({ where: { slug: dto.slug } });
    if (existing) {
      throw new ConflictException({ code: 'slug_taken', message: MESSAGES.product.slugTaken });
    }

    try {
      const product = await this.prisma.product.create({
        data: {
          slug: dto.slug,
          name: dto.name,
          description: dto.description ?? null,
          price: new Prisma.Decimal(dto.price),
          currency: dto.currency ?? 'IRR',
          unit: dto.unit ?? DEFAULT_UNIT,
          imageUrl: dto.imageUrl ?? null,
          isActive: dto.isActive ?? true,
          sortOrder: dto.sortOrder ?? 0,
        },
      });
      return toPublicProduct(product);
    } catch (error) {
      // Two admins submitting the same slug at once: the index is what actually
      // decides, so the loser is turned into the same message as the pre-check.
      if (isSlugCollision(error)) {
        throw new ConflictException({ code: 'slug_taken', message: MESSAGES.product.slugTaken });
      }
      throw error;
    }
  }

  /**
   * Editing a product is a patch, not a replace: only the keys the admin sent
   * are written, so two admins on two different fields do not overwrite each
   * other's work.
   *
   * Nothing here reaches backwards. An order snapshots `productName`,
   * `unitPrice` and `unit` onto `order_items` at checkout, so a price change
   * today leaves yesterday's order — and its total — exactly as it was.
   * Deactivating a product likewise only stops the *next* order: `priceBasket`
   * rejects an inactive product, while orders already placed still deliver.
   */
  async update(id: string, dto: UpdateProductDto): Promise<PublicProduct> {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException({ code: 'product_not_found', message: MESSAGES.product.notFound });
    }

    const data: Prisma.ProductUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.price !== undefined) data.price = new Prisma.Decimal(dto.price);
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.unit !== undefined) data.unit = dto.unit;
    if (dto.imageUrl !== undefined) data.imageUrl = dto.imageUrl;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;

    // An empty patch is not an error — it is a form submitted with nothing
    // changed. Skipping the write keeps `updatedAt` honest.
    if (Object.keys(data).length === 0) return toPublicProduct(existing);

    const product = await this.prisma.product.update({ where: { id }, data });
    return toPublicProduct(product);
  }
}

function isSlugCollision(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002' &&
    JSON.stringify(error.meta?.['target'] ?? '').includes('slug')
  );
}
