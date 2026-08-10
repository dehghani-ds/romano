import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { CreateProductRequest, Product, UpdateProductRequest } from '@romano/domain';

import { apiUrl, toUserMessage } from './api';

/**
 * Products, as the admin sees them.
 *
 * `/admin/products` rather than the public `/products`: an inactive product is
 * still one the admin has to know about, if only because it is holding a slug.
 */
@Injectable({ providedIn: 'root' })
export class AdminProductsService {
  private readonly http = inject(HttpClient);

  async list(): Promise<Product[]> {
    try {
      return await firstValueFrom(this.http.get<Product[]>(apiUrl('/admin/products')));
    } catch (error) {
      throw new Error(toUserMessage(error));
    }
  }

  async create(input: CreateProductRequest): Promise<Product> {
    try {
      return await firstValueFrom(this.http.post<Product>(apiUrl('/admin/products'), input));
    } catch (error) {
      throw new Error(toUserMessage(error));
    }
  }

  /** A patch: send the fields that changed, and the rest are left as they are. */
  async update(id: string, patch: UpdateProductRequest): Promise<Product> {
    try {
      return await firstValueFrom(
        this.http.patch<Product>(apiUrl(`/admin/products/${id}`), patch),
      );
    } catch (error) {
      throw new Error(toUserMessage(error));
    }
  }
}
