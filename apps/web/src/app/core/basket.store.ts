import { Injectable, computed, inject, signal } from '@angular/core';

import type { OrderLineRequest, Product } from '@romano/domain';
import { BROWSER_STORAGE, type KeyValueStorage } from '@romano/ui';

const STORAGE_KEY = 'romano-basket';

/** Matches MAX_QUANTITY / MAX_BASKET_LINES in the API. */
export const MAX_LINE_QUANTITY = 20;
export const MAX_LINES = 20;

/** One line, kept by product id. Quantities are merged, never repeated. */
export interface BasketLine {
  productId: string;
  quantity: number;
}

/** A line joined back to its product, for rendering and for the total. */
export interface BasketEntry extends BasketLine {
  product: Product;
  lineTotal: number;
}

/**
 * The basket.
 *
 * Only ids and counts are stored — never a price. A stored price would be a
 * price the customer could edit, and the server prices the order from the
 * `products` table anyway. It also means a price change between adding and
 * checking out shows up correctly instead of being remembered wrong.
 *
 * Kept in `localStorage` so a reload, or a second tab, does not empty it.
 */
@Injectable({ providedIn: 'root' })
export class BasketStore {
  private readonly storage = inject(BROWSER_STORAGE);
  private readonly _lines = signal<BasketLine[]>(read(this.storage));

  /** The catalog, handed in by whoever loaded it, so totals can be computed. */
  private readonly _catalog = signal<Product[]>([]);

  readonly lines = this._lines.asReadonly();

  /**
   * Lines that still match a live product. A product retired between two visits
   * silently drops out rather than blocking checkout with an error.
   */
  readonly entries = computed<BasketEntry[]>(() => {
    const byId = new Map(this._catalog().map((product) => [product.id, product]));
    return this._lines()
      .map((line) => {
        const product = byId.get(line.productId);
        if (!product || !product.isActive) return null;
        return { ...line, product, lineTotal: product.price * line.quantity };
      })
      .filter((entry): entry is BasketEntry => entry !== null);
  });

  readonly isEmpty = computed(() => this.entries().length === 0);
  readonly lineCount = computed(() => this.entries().length);
  readonly totalQuantity = computed(() =>
    this.entries().reduce((sum, entry) => sum + entry.quantity, 0),
  );
  readonly total = computed(() => this.entries().reduce((sum, entry) => sum + entry.lineTotal, 0));

  /** Every basket line shares one currency, because the API requires it. */
  readonly currency = computed(() => this.entries()[0]?.product.currency ?? 'IRR');

  setCatalog(products: Product[]): void {
    this._catalog.set(products);
  }

  quantityOf(productId: string): number {
    return this._lines().find((line) => line.productId === productId)?.quantity ?? 0;
  }

  has(productId: string): boolean {
    return this.quantityOf(productId) > 0;
  }

  add(productId: string, quantity = 1): void {
    this.setQuantity(productId, this.quantityOf(productId) + quantity);
  }

  /** Zero or less removes the line; above the cap clamps to it. */
  setQuantity(productId: string, quantity: number): void {
    const rounded = Math.floor(quantity);

    if (!Number.isFinite(rounded) || rounded <= 0) {
      this.remove(productId);
      return;
    }

    const capped = Math.min(rounded, MAX_LINE_QUANTITY);
    const lines = this._lines();
    const existing = lines.find((line) => line.productId === productId);

    if (existing) {
      this.persist(
        lines.map((line) => (line.productId === productId ? { ...line, quantity: capped } : line)),
      );
      return;
    }

    if (lines.length >= MAX_LINES) return;
    this.persist([...lines, { productId, quantity: capped }]);
  }

  remove(productId: string): void {
    this.persist(this._lines().filter((line) => line.productId !== productId));
  }

  clear(): void {
    this.persist([]);
  }

  /** What `POST /api/orders` wants: ids and counts, nothing else. */
  toOrderLines(): OrderLineRequest[] {
    return this.entries().map((entry) => ({
      productId: entry.productId,
      quantity: entry.quantity,
    }));
  }

  private persist(lines: BasketLine[]): void {
    this._lines.set(lines);
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      // A full or unavailable storage must not cost the customer their basket
      // for this page — the signal is still the source of truth.
    }
  }
}

function read(storage: KeyValueStorage): BasketLine[] {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const lines: BasketLine[] = [];
    for (const entry of parsed) {
      const line = entry as Partial<BasketLine>;
      if (typeof line.productId !== 'string') continue;
      if (typeof line.quantity !== 'number' || !Number.isFinite(line.quantity)) continue;

      const quantity = Math.min(Math.max(Math.floor(line.quantity), 1), MAX_LINE_QUANTITY);
      if (lines.some((existing) => existing.productId === line.productId)) continue;
      lines.push({ productId: line.productId, quantity });
    }
    return lines.slice(0, MAX_LINES);
  } catch {
    return [];
  }
}
