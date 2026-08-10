import { ConflictException, Injectable } from '@nestjs/common';

import { MESSAGES } from '../common/messages';
import { Prisma, type Product } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateProductDto } from './dto';

export interface PublicProduct {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
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
}

function isSlugCollision(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002' &&
    JSON.stringify(error.meta?.['target'] ?? '').includes('slug')
  );
}
