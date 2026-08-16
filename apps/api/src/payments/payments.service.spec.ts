import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { GatewayOutcome, GatewaySession, OrdersService } from '../orders/orders.service';
import type { PaymentSettings, PaymentSettingsService } from './payment-settings.service';
import { PaymentsService } from './payments.service';
import type { ZibalClient } from './zibal.client';
import type { ZibalVerifyResponse } from './zibal.protocol';

/**
 * What a callback is allowed to do to an order.
 *
 * The callback is the one endpoint in Romano an untrusted party can reach with
 * something that looks like authority: Zibal redirects the *payer's own browser*
 * to it, carrying `success=1&status=2&trackId=…` in a query string that payer
 * can retype. Everything below is a test of the rule that follows from that —
 * nothing on the URL is believed, and an order is marked paid only when Zibal,
 * asked directly, says so about the right amount.
 */

const SESSION: GatewaySession = {
  orderId: '0198c0de-0000-7000-8000-000000000001',
  orderNumber: 'RM-260816-0007',
  amount: 160_000,
  currency: 'IRR',
  isVerified: false,
};

const CONFIGURED: PaymentSettings = {
  cardToCardEnabled: true,
  cardHolder: 'محمدرضا دهقانی ابیانه',
  cardNumber: '6219861905572805',
  onlineEnabled: true,
  zibalMerchant: 'test-merchant',
  zibalBaseUrl: 'https://gateway.zibal.ir',
  zibalCallbackUrl: 'https://romano.example/api/payments/callback',
  webBaseUrl: 'https://romano.example',
};

function build(overrides: {
  session?: GatewaySession | null;
  verify?: ZibalVerifyResponse | (() => never);
  config?: Partial<PaymentSettings>;
}) {
  const settle = vi.fn<(trackId: string, outcome: GatewayOutcome) => Promise<void>>(
    async () => undefined,
  );

  const orders = {
    findGatewaySession: vi.fn(async () =>
      overrides.session === undefined ? SESSION : overrides.session,
    ),
    settleGatewaySession: settle,
  } as unknown as OrdersService;

  const resolved: PaymentSettings = { ...CONFIGURED, ...overrides.config };

  const zibal = {
    isConfigured: vi.fn(async () => Boolean(resolved.onlineEnabled && resolved.zibalMerchant)),
    verify: vi.fn(async () => {
      const verify = overrides.verify;
      if (typeof verify === 'function') verify();
      return (verify ?? { result: 100, status: 1, amount: 160_000 }) as ZibalVerifyResponse;
    }),
  } as unknown as ZibalClient;

  const settings = {
    current: vi.fn(async () => resolved),
  } as unknown as PaymentSettingsService;

  return { service: new PaymentsService(orders, zibal, settings), orders, zibal, settle };
}

/** The outcome a settle call recorded, if it recorded one. */
function settledWith(settle: ReturnType<typeof vi.fn>): GatewayOutcome | undefined {
  return settle.mock.calls[0]?.[1] as GatewayOutcome | undefined;
}

describe('settling a gateway callback', () => {
  beforeEach(() => vi.clearAllMocks());

  it('marks the order paid when Zibal confirms the payment', async () => {
    const { service, settle } = build({
      verify: {
        result: 100,
        status: 1,
        amount: 160_000,
        refNumber: 987654,
        cardNumber: '62741****44',
        paidAt: '2026-08-16T12:30:00.000000',
      },
    });

    const result = await service.settleCallback('15966442233311');

    expect(result.outcome).toBe('paid');
    expect(result.orderId).toBe(SESSION.orderId);
    expect(settledWith(settle)).toMatchObject({
      paid: true,
      reference: '987654',
      cardNumber: '62741****44',
    });
  });

  it('ignores the query string and asks Zibal instead', async () => {
    // The forged case: the payer edits `success=1` onto the URL after
    // cancelling. Zibal says status 3 — cancelled by user — and that wins.
    const { service, zibal, settle } = build({ verify: { result: 202, status: 3 } });

    const result = await service.settleCallback('15966442233311');

    expect(zibal.verify).toHaveBeenCalledWith('15966442233311');
    expect(result.outcome).toBe('failed');
    expect(settledWith(settle)).toEqual({ paid: false });
  });

  it('refuses to settle when the amount is not the order total', async () => {
    // Should be unreachable — we chose the amount — so this is deliberately not
    // a "failed": it leaves the payment untouched for a person to look at
    // rather than quietly writing off a mismatch.
    const { service, settle } = build({ verify: { result: 100, status: 1, amount: 1_000 } });

    const result = await service.settleCallback('15966442233311');

    expect(result.outcome).toBe('unknown');
    expect(settle).not.toHaveBeenCalled();
  });

  it('treats a replayed callback for a settled payment as paid', async () => {
    const { service, zibal, settle } = build({ session: { ...SESSION, isVerified: true } });

    const result = await service.settleCallback('15966442233311');

    expect(result.outcome).toBe('paid');
    // Already settled — there is nothing to ask and nothing to write.
    expect(zibal.verify).not.toHaveBeenCalled();
    expect(settle).not.toHaveBeenCalled();
  });

  it('accepts Zibal answering "already verified" on a repeat', async () => {
    // 201, not 100. A refresh of the callback page must not flip a paid order
    // back to unpaid.
    const { service, settle } = build({ verify: { result: 201, status: 1, amount: 160_000 } });

    const result = await service.settleCallback('15966442233311');

    expect(result.outcome).toBe('paid');
    expect(settledWith(settle)).toMatchObject({ paid: true });
  });

  it('counts a paid-but-unverified session as paid', async () => {
    const { service, settle } = build({ verify: { result: 100, status: 2, amount: 160_000 } });

    const result = await service.settleCallback('15966442233311');

    expect(result.outcome).toBe('paid');
    expect(settledWith(settle)).toMatchObject({ paid: true });
  });

  it('releases the session when the payment failed, so the customer can retry', async () => {
    const { service, settle } = build({ verify: { result: 100, status: 5, amount: 160_000 } });

    const result = await service.settleCallback('15966442233311');

    expect(result.outcome).toBe('failed');
    // Says *why* — "موجودی حساب کافی نیست" is something the payer can act on.
    expect(result.message).toContain('موجودی');
    expect(settledWith(settle)).toEqual({ paid: false });
  });

  it('leaves the session alone when Zibal cannot be reached', async () => {
    const { service, settle } = build({
      verify: () => {
        throw new Error('gateway unreachable');
      },
    });

    const result = await service.settleCallback('15966442233311');

    // Not "failed": we do not know that it failed. Keeping the session open is
    // what lets a payment that did go through still be settled on a retry.
    expect(result.outcome).toBe('unknown');
    expect(settle).not.toHaveBeenCalled();
  });

  it('shrugs off a trackId that is not ours', async () => {
    const { service, zibal, settle } = build({ session: null });

    const result = await service.settleCallback('99999999999');

    expect(result.outcome).toBe('unknown');
    expect(result.orderId).toBeNull();
    expect(zibal.verify).not.toHaveBeenCalled();
    expect(settle).not.toHaveBeenCalled();
  });

  it('rejects a malformed trackId without touching the database', async () => {
    const { service, orders, zibal } = build({});

    const result = await service.settleCallback("1' or '1'='1");

    expect(result.outcome).toBe('unknown');
    expect(orders.findGatewaySession).not.toHaveBeenCalled();
    expect(zibal.verify).not.toHaveBeenCalled();
  });

  it('rejects a missing trackId', async () => {
    const { service, orders } = build({});

    expect((await service.settleCallback(undefined)).outcome).toBe('unknown');
    expect(orders.findGatewaySession).not.toHaveBeenCalled();
  });
});

describe('options', () => {
  it('offers online payment when the settings row is complete', async () => {
    const { service } = build({});
    expect(await service.options()).toMatchObject({ onlineEnabled: true, currency: 'IRR' });
  });

  it('does not offer it when an admin has switched it off', async () => {
    const { service } = build({ config: { onlineEnabled: false } });
    expect((await service.options()).onlineEnabled).toBe(false);
  });

  it('does not offer it when the switch is on but no key has been entered', async () => {
    // Half-configured is the state a fresh database is in, and the state an
    // admin passes through while filling the form. A button that appears here
    // would fail at the bank.
    const { service } = build({ config: { zibalMerchant: null } });
    expect((await service.options()).onlineEnabled).toBe(false);
  });

  it('never puts the gateway credential in the public payload', async () => {
    const { service } = build({});
    expect(JSON.stringify(await service.options())).not.toContain('test-merchant');
  });

  it('hands back the card to transfer to, and drops it when switched off', async () => {
    expect((await build({}).service.options()).cardToCard).toEqual({
      holder: 'محمدرضا دهقانی ابیانه',
      number: '6219861905572805',
    });

    const off = build({ config: { cardToCardEnabled: false } });
    expect((await off.service.options()).cardToCard).toBeNull();
  });
});
