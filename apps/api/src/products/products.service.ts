import { Injectable } from '@nestjs/common';

import type { Product } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

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
}
