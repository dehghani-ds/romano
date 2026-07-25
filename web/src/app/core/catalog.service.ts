import { Injectable, inject } from '@angular/core';
import { Product, SeatOption } from './models';
import { SUPABASE, toUserMessage } from './supabase.client';

/**
 * Reference data: what we sell, and where people sit.
 *
 * Both lists are small and change rarely, so they are fetched once and cached
 * for the life of the tab.
 */
@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly supabase = inject(SUPABASE);

  private seatsCache: SeatOption[] | null = null;
  private productsCache: Product[] | null = null;

  async seats(): Promise<SeatOption[]> {
    if (this.seatsCache) return this.seatsCache;

    const { data, error } = await this.supabase
      .from('seats')
      .select(
        `
        *,
        zones ( id, code, name, floor ),
        refrigerators!seats_nearest_refrigerator_id_fkey ( id, code, label, description )
      `,
      )
      .eq('is_active', true)
      .order('code');

    if (error) throw new Error(toUserMessage(error));

    this.seatsCache = (data ?? []) as SeatOption[];
    return this.seatsCache;
  }

  async products(): Promise<Product[]> {
    if (this.productsCache) return this.productsCache;

    const { data, error } = await this.supabase
      .from('products')
      .select('*')
      .eq('is_active', true)
      .order('sort_order');

    if (error) throw new Error(toUserMessage(error));

    this.productsCache = (data ?? []) as Product[];
    return this.productsCache;
  }

  /** The one product we sell today. */
  async featuredProduct(): Promise<Product | null> {
    const all = await this.products();
    return all.find((p) => p.slug === 'romano') ?? all[0] ?? null;
  }
}
