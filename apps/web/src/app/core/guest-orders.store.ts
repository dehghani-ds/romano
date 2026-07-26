import { Injectable, inject, signal } from '@angular/core';

import { BROWSER_STORAGE, type KeyValueStorage } from '@romano/ui';

const STORAGE_KEY = 'romano-guest-orders';
const MAX_REMEMBERED = 25;

export interface GuestOrderRef {
  id: string;
  orderNumber: string;
  token: string;
  placedAt: string;
}

/**
 * A guest's receipt book.
 *
 * Someone who orders without an account gets a token back exactly once. This is
 * where it is kept, so "سفارش‌های من" works in that browser without a login.
 * Clearing site data loses them — which is why the order number plus the mobile
 * still works on the tracking page, and why signing up can claim an order.
 */
@Injectable({ providedIn: 'root' })
export class GuestOrdersStore {
  private readonly storage = inject(BROWSER_STORAGE);
  private readonly _refs = signal<GuestOrderRef[]>(read(this.storage));

  readonly refs = this._refs.asReadonly();

  tokenFor(orderId: string): string | null {
    return this._refs().find((ref) => ref.id === orderId)?.token ?? null;
  }

  tokens(): string[] {
    return this._refs().map((ref) => ref.token);
  }

  remember(ref: Omit<GuestOrderRef, 'placedAt'>): void {
    const next = [
      { ...ref, placedAt: new Date().toISOString() },
      ...this._refs().filter((existing) => existing.id !== ref.id),
    ].slice(0, MAX_REMEMBERED);

    this.persist(next);
  }

  forget(orderId: string): void {
    this.persist(this._refs().filter((ref) => ref.id !== orderId));
  }

  clear(): void {
    this.persist([]);
  }

  private persist(refs: GuestOrderRef[]): void {
    this._refs.set(refs);
    this.storage.setItem(STORAGE_KEY, JSON.stringify(refs));
  }
}

function read(storage: KeyValueStorage): GuestOrderRef[] {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    // An entry without a token cannot unlock anything, so it is not worth keeping.
    return parsed.filter(
      (ref): ref is GuestOrderRef =>
        typeof ref === 'object' &&
        ref !== null &&
        typeof (ref as GuestOrderRef).id === 'string' &&
        typeof (ref as GuestOrderRef).token === 'string',
    );
  } catch {
    return [];
  }
}
