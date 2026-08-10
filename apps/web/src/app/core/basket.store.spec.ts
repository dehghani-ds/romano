import { TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach } from 'vitest';

import type { Product } from '@romano/domain';
import { BROWSER_STORAGE, createMemoryStorage, type KeyValueStorage } from '@romano/ui';

import { BasketStore, MAX_LINE_QUANTITY } from './basket.store';

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p-romano',
    slug: 'romano',
    name: 'رومانو',
    description: null,
    price: 129900,
    currency: 'IRR',
    unit: 'فنجان',
    imageUrl: null,
    isActive: true,
    sortOrder: 0,
    ...overrides,
  };
}

const romano = product();
const cookie = product({ id: 'p-cookie', slug: 'cookie', name: 'کوکی', price: 45000, unit: 'عدد' });

function makeStore(storage: KeyValueStorage = createMemoryStorage()) {
  TestBed.configureTestingModule({
    providers: [{ provide: BROWSER_STORAGE, useValue: storage }],
  });
  const store = TestBed.inject(BasketStore);
  store.setCatalog([romano, cookie]);
  return { store, storage };
}

describe('BasketStore', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('starts empty', () => {
    const { store } = makeStore();
    expect(store.isEmpty()).toBe(true);
    expect(store.total()).toBe(0);
  });

  it('adds a product and totals it from the catalog price', () => {
    const { store } = makeStore();
    store.add('p-romano', 2);

    expect(store.quantityOf('p-romano')).toBe(2);
    expect(store.total()).toBe(259800);
    expect(store.totalQuantity()).toBe(2);
  });

  it('merges a repeat add into one line', () => {
    const { store } = makeStore();
    store.add('p-romano');
    store.add('p-romano');

    expect(store.lines()).toHaveLength(1);
    expect(store.quantityOf('p-romano')).toBe(2);
  });

  it('totals a mixed basket', () => {
    const { store } = makeStore();
    store.add('p-romano', 2);
    store.add('p-cookie', 3);

    expect(store.total()).toBe(394800);
    expect(store.lineCount()).toBe(2);
    expect(store.totalQuantity()).toBe(5);
  });

  it('clamps a quantity to the per-line cap', () => {
    const { store } = makeStore();
    store.setQuantity('p-romano', 999);
    expect(store.quantityOf('p-romano')).toBe(MAX_LINE_QUANTITY);
  });

  it('removes the line when the quantity reaches zero', () => {
    const { store } = makeStore();
    store.add('p-romano');
    store.setQuantity('p-romano', 0);

    expect(store.has('p-romano')).toBe(false);
    expect(store.isEmpty()).toBe(true);
  });

  it('hides a line whose product went inactive, without breaking the total', () => {
    const { store } = makeStore();
    store.add('p-romano', 1);
    store.add('p-cookie', 1);

    store.setCatalog([romano, { ...cookie, isActive: false }]);

    expect(store.entries().map((entry) => entry.productId)).toEqual(['p-romano']);
    expect(store.total()).toBe(129900);
  });

  it('sends the API ids and counts only', () => {
    const { store } = makeStore();
    store.add('p-romano', 2);
    store.add('p-cookie', 3);

    expect(store.toOrderLines()).toEqual([
      { productId: 'p-romano', quantity: 2 },
      { productId: 'p-cookie', quantity: 3 },
    ]);
  });

  it('survives a reload through storage', () => {
    const storage = createMemoryStorage();
    const first = makeStore(storage);
    first.store.add('p-romano', 4);

    TestBed.resetTestingModule();
    const second = makeStore(storage);

    expect(second.store.quantityOf('p-romano')).toBe(4);
  });

  it('ignores corrupt stored data rather than throwing', () => {
    const storage = createMemoryStorage();
    storage.setItem('romano-basket', '{ not json');
    const { store } = makeStore(storage);

    expect(store.isEmpty()).toBe(true);
  });

  it('drops malformed entries and de-duplicates on read', () => {
    const storage = createMemoryStorage();
    storage.setItem(
      'romano-basket',
      JSON.stringify([
        { productId: 'p-romano', quantity: 2 },
        { productId: 'p-romano', quantity: 5 },
        { productId: 'p-cookie' },
        { quantity: 3 },
      ]),
    );
    const { store } = makeStore(storage);

    expect(store.lines()).toEqual([{ productId: 'p-romano', quantity: 2 }]);
  });
});
