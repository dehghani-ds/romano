import { InjectionToken } from '@angular/core';

/** The slice of the Storage API this app actually uses. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Persistent browser storage, injected rather than reached for.
 *
 * Three reasons this is a token and not a bare `localStorage` reference:
 * private browsing can make the real thing throw on write, server-side
 * rendering has no `window` at all, and a test can hand a component a plain
 * object instead of depending on the DOM the runner happens to provide.
 *
 * Whichever of those applies, the caller sees the same interface and never has
 * to null-check.
 */
export const BROWSER_STORAGE = new InjectionToken<KeyValueStorage>('BROWSER_STORAGE', {
  providedIn: 'root',
  factory: () => resolveStorage(),
});

export function resolveStorage(): KeyValueStorage {
  try {
    const storage = globalThis.localStorage ?? globalThis.window?.localStorage;
    if (storage) {
      // Touch it: Safari in private mode exposes the object but throws on use.
      const probe = '__romano_probe__';
      storage.setItem(probe, '1');
      storage.removeItem(probe);
      return storage;
    }
  } catch {
    // Fall through to the in-memory stand-in.
  }
  return createMemoryStorage();
}

/** Lives for one page load. Better than crashing, worse than the real thing. */
export function createMemoryStorage(): KeyValueStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}
