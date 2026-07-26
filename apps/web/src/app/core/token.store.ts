import { Injectable, computed, inject, signal } from '@angular/core';

import { BROWSER_STORAGE, type KeyValueStorage } from '@romano/ui';

const STORAGE_KEY = 'romano-auth';

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * Where the session lives between page loads.
 *
 * Kept apart from AuthService so the HTTP interceptor can read and refresh
 * tokens without depending on the service that itself makes HTTP calls.
 */
@Injectable({ providedIn: 'root' })
export class TokenStore {
  private readonly storage = inject(BROWSER_STORAGE);
  private readonly _tokens = signal<StoredTokens | null>(read(this.storage));

  readonly tokens = this._tokens.asReadonly();
  readonly accessToken = computed(() => this._tokens()?.accessToken ?? null);
  readonly hasSession = computed(() => this._tokens() !== null);

  set(tokens: StoredTokens): void {
    this._tokens.set(tokens);
    this.storage.setItem(STORAGE_KEY, JSON.stringify(tokens));
  }

  clear(): void {
    this._tokens.set(null);
    this.storage.removeItem(STORAGE_KEY);
  }
}

function read(storage: KeyValueStorage): StoredTokens | null {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredTokens>;
    // A half-written entry is no session — better to sign in again than to send
    // a malformed Authorization header on every request.
    if (typeof parsed.accessToken !== 'string' || typeof parsed.refreshToken !== 'string') {
      return null;
    }
    return { accessToken: parsed.accessToken, refreshToken: parsed.refreshToken };
  } catch {
    return null;
  }
}
