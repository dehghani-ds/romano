import { describe, expect, it } from 'vitest';

import type { AuthUser } from '../auth/auth.types';
import { OrderStatus } from '../generated/prisma/enums';
import { ALLOWED_TRANSITIONS, canView } from './orders.service';

const customer: AuthUser = { id: 'user-1', username: 'mina_t', role: 'customer' };
const otherCustomer: AuthUser = { id: 'user-2', username: 'reza_k', role: 'customer' };
const admin: AuthUser = { id: 'admin-1', username: 'admin', role: 'admin' };

const ownedOrder = { userId: 'user-1', guestToken: null };
const guestOrder = { userId: null, guestToken: 'a-very-secret-token' };

describe('order status machine', () => {
  it('walks the intended path', () => {
    expect(ALLOWED_TRANSITIONS.pending).toContain('in_progress');
    expect(ALLOWED_TRANSITIONS.in_progress).toContain('done');
  });

  it('allows cancelling before delivery', () => {
    expect(ALLOWED_TRANSITIONS.pending).toContain('cancelled');
    expect(ALLOWED_TRANSITIONS.in_progress).toContain('cancelled');
  });

  it('never skips preparation', () => {
    expect(ALLOWED_TRANSITIONS.pending).not.toContain('done');
  });

  it('treats done and cancelled as terminal', () => {
    expect(ALLOWED_TRANSITIONS.done).toHaveLength(0);
    expect(ALLOWED_TRANSITIONS.cancelled).toHaveLength(0);
  });

  it('covers every status, so a new one cannot be forgotten', () => {
    for (const status of Object.values(OrderStatus)) {
      expect(ALLOWED_TRANSITIONS[status]).toBeDefined();
    }
  });
});

describe('canView', () => {
  it('lets an owner read their own order', () => {
    expect(canView(ownedOrder, { user: customer })).toBe(true);
  });

  it('hides an order from a different signed-in customer', () => {
    expect(canView(ownedOrder, { user: otherCustomer })).toBe(false);
  });

  it('lets an admin read anything', () => {
    expect(canView(ownedOrder, { user: admin })).toBe(true);
    expect(canView(guestOrder, { user: admin })).toBe(true);
  });

  it('lets a guest read with the exact token', () => {
    expect(canView(guestOrder, { guestToken: 'a-very-secret-token' })).toBe(true);
  });

  it('rejects a wrong or truncated guest token', () => {
    expect(canView(guestOrder, { guestToken: 'a-very-secret-toke' })).toBe(false);
    expect(canView(guestOrder, { guestToken: 'totally-different!!' })).toBe(false);
    expect(canView(guestOrder, { guestToken: '' })).toBe(false);
  });

  it('rejects an anonymous caller with no token at all', () => {
    expect(canView(guestOrder, {})).toBe(false);
    expect(canView(ownedOrder, {})).toBe(false);
  });

  it('does not let a guest token unlock an account-owned order', () => {
    expect(canView(ownedOrder, { guestToken: 'a-very-secret-token' })).toBe(false);
  });
});
