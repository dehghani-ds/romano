import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { BROWSER_STORAGE, createMemoryStorage, type KeyValueStorage } from '@romano/ui';

import { TokenStore } from './token.store';

const ADMIN_KEY = 'romano-admin-auth';

describe('TokenStore (dashboard)', () => {
  let storage: KeyValueStorage;

  const configure = () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: BROWSER_STORAGE, useValue: storage }],
    });
    return TestBed.inject(TokenStore);
  };

  beforeEach(() => {
    storage = createMemoryStorage();
  });

  it('uses a key of its own so the admin session is separate from the customer one', () => {
    // Both apps run on localhost during development and would otherwise share
    // storage — signing into one would silently sign you into the other.
    configure().set({ accessToken: 'a', refreshToken: 'r' });

    expect(storage.getItem(ADMIN_KEY)).not.toBeNull();
    expect(storage.getItem('romano-auth')).toBeNull();
  });

  it('has no session before signing in', () => {
    const store = configure();

    expect(store.hasSession()).toBe(false);
    expect(store.accessToken()).toBeNull();
  });

  it('restores a stored session on reload', () => {
    configure().set({ accessToken: 'access', refreshToken: 'refresh' });

    // Same storage, fresh injector — the moral equivalent of a reload.
    const reloaded = configure();

    expect(reloaded.hasSession()).toBe(true);
    expect(reloaded.accessToken()).toBe('access');
  });

  it('clearing removes it from storage too', () => {
    const store = configure();
    store.set({ accessToken: 'a', refreshToken: 'r' });

    store.clear();

    expect(store.hasSession()).toBe(false);
    expect(storage.getItem(ADMIN_KEY)).toBeNull();
  });

  it('treats a half-written entry as no session', () => {
    storage.setItem(ADMIN_KEY, JSON.stringify({ accessToken: 'only-half' }));

    expect(configure().hasSession()).toBe(false);
  });

  it('treats unparseable storage as no session', () => {
    storage.setItem(ADMIN_KEY, '}{');

    expect(configure().hasSession()).toBe(false);
  });
});
