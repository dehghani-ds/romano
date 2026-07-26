import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { Product } from '@romano/domain';

import { apiUrl, toUserMessage } from './api';

/** The menu. One product today; the API already returns a list. */
@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly http = inject(HttpClient);
  private cache: Product[] | null = null;

  async products(): Promise<Product[]> {
    if (this.cache) return this.cache;

    try {
      this.cache = await firstValueFrom(this.http.get<Product[]>(apiUrl('/products')));
      return this.cache;
    } catch (error) {
      throw new Error(toUserMessage(error));
    }
  }

  async featuredProduct(): Promise<Product | null> {
    const products = await this.products();
    return products.find((product) => product.slug === 'romano') ?? products[0] ?? null;
  }
}
