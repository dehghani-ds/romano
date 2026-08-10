import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { Product } from '@romano/domain';

import { apiUrl, toUserMessage } from './api';

/** The menu — every active product, in the order the admin sorted them. */
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
}
