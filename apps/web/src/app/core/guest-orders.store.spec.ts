import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { BROWSER_STORAGE, createMemoryStorage, type KeyValueStorage } from '@romano/ui';

import { GuestOrdersStore } from './guest-orders.store';

/**
 * This store is the only thing standing between a guest and losing their order,
 * so its edge cases matter more than its happy path.
 *
 * Storage is the injected in-memory implementation — the same code path a
 * browser with storage disabled falls back to — so the specs exercise the
 * store's logic, not the test runner's DOM.
 */
describe('GuestOrdersStore', () => {
  let storage: KeyValueStorage;
  let store: GuestOrdersStore;

  const configure = () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: BROWSER_STORAGE, useValue: storage }],
    });
    return TestBed.inject(GuestOrdersStore);
  };

  beforeEach(() => {
    storage = createMemoryStorage();
    store = configure();
  });

  it('starts empty', () => {
    expect(store.refs()).toEqual([]);
    expect(store.tokens()).toEqual([]);
  });

  it('remembers an order and hands its token back', () => {
    store.remember({ id: 'order-1', orderNumber: 'RM-260726-0001', token: 'secret-1' });

    expect(store.tokenFor('order-1')).toBe('secret-1');
    expect(store.tokens()).toEqual(['secret-1']);
  });

  it('returns null for an order it does not hold', () => {
    expect(store.tokenFor('unknown')).toBeNull();
  });

  it('keeps the newest first', () => {
    store.remember({ id: 'a', orderNumber: 'RM-1', token: 't-a' });
    store.remember({ id: 'b', orderNumber: 'RM-2', token: 't-b' });

    expect(store.refs().map((ref) => ref.id)).toEqual(['b', 'a']);
  });

  it('replaces rather than duplicates when the same order is remembered twice', () => {
    store.remember({ id: 'a', orderNumber: 'RM-1', token: 'old' });
    store.remember({ id: 'a', orderNumber: 'RM-1', token: 'new' });

    expect(store.refs()).toHaveLength(1);
    expect(store.tokenFor('a')).toBe('new');
  });

  it('survives a page reload', () => {
    store.remember({ id: 'a', orderNumber: 'RM-1', token: 't-a' });

    // Same storage, fresh injector — the moral equivalent of a reload.
    const reloaded = configure();

    expect(reloaded.tokenFor('a')).toBe('t-a');
  });

  it('ignores corrupted storage instead of throwing', () => {
    storage.setItem('romano-guest-orders', 'not json at all');

    expect(configure().refs()).toEqual([]);
  });

  it('drops entries that are missing a token', () => {
    storage.setItem(
      'romano-guest-orders',
      JSON.stringify([
        { id: 'a', orderNumber: 'RM-1' },
        { id: 'b', orderNumber: 'RM-2', token: 'ok' },
      ]),
    );

    expect(configure().refs().map((ref) => ref.id)).toEqual(['b']);
  });

  it('forgets a single order without touching the rest', () => {
    store.remember({ id: 'a', orderNumber: 'RM-1', token: 't-a' });
    store.remember({ id: 'b', orderNumber: 'RM-2', token: 't-b' });

    store.forget('a');

    expect(store.tokenFor('a')).toBeNull();
    expect(store.tokenFor('b')).toBe('t-b');
  });

  it('caps how many it keeps so storage cannot grow without bound', () => {
    for (let i = 0; i < 40; i++) {
      store.remember({ id: `order-${i}`, orderNumber: `RM-${i}`, token: `t-${i}` });
    }

    expect(store.refs()).toHaveLength(25);
    // The newest survive; the oldest fall off.
    expect(store.tokenFor('order-39')).toBe('t-39');
    expect(store.tokenFor('order-0')).toBeNull();
  });
});
