import { describe, expect, it } from 'vitest';

import { hintOf, PaymentSettingsService } from './payment-settings.service';

/**
 * The rules that make it safe to keep a gateway credential in a table an admin
 * can edit. Both of them are about what does *not* come back out.
 */

describe('hintOf', () => {
  it('shows enough to recognise a key and not enough to be one', () => {
    // A real Zibal merchant id is 24 hex characters; eight of them identifies
    // which key is installed without reconstructing it.
    expect(hintOf('3f19ab7c204e8d5b6c1a9e42')).toBe('3f19••••9e42');
  });

  it('never returns more than eight characters of the key', () => {
    for (const key of ['3f19ab7c204e8d5b6c1a9e42', 'abcdefghijkl', 'x'.repeat(128)]) {
      const hint = hintOf(key) ?? '';
      const revealed = hint.replace(/•/g, '');
      expect(revealed.length, `key of length ${key.length}`).toBeLessThanOrEqual(8);
    }
  });

  it('reveals nothing at all when the key is too short to mask safely', () => {
    // Eight of twelve characters is most of a short key. Below that threshold
    // the hint stops being a hint and starts being the secret.
    expect(hintOf('short')).toBe('••••');
    expect(hintOf('elevenchars')).toBe('••••');
  });

  it('has nothing to show when no key is set', () => {
    expect(hintOf(null)).toBeNull();
    expect(hintOf('')).toBeNull();
  });
});

describe('isOnlineReady', () => {
  const ready = {
    onlineEnabled: true,
    zibalMerchant: '3f19ab7c204e8d5b6c1a9e42',
    zibalCallbackUrl: 'https://romano.example/api/payments/callback',
  };

  it('is ready only when the switch is on and the gateway is configured', () => {
    expect(PaymentSettingsService.isOnlineReady(ready)).toBe(true);
  });

  it('is not ready when an admin has switched it off', () => {
    expect(PaymentSettingsService.isOnlineReady({ ...ready, onlineEnabled: false })).toBe(false);
  });

  it('is not ready half-configured, however keen the switch is', () => {
    // Both of these are states an admin passes through while filling the form.
    // Offering the button in either puts a customer in front of a bank error.
    expect(PaymentSettingsService.isOnlineReady({ ...ready, zibalMerchant: null })).toBe(false);
    expect(PaymentSettingsService.isOnlineReady({ ...ready, zibalCallbackUrl: null })).toBe(false);
  });

  it('does not count whitespace as configuration', () => {
    expect(PaymentSettingsService.isOnlineReady({ ...ready, zibalMerchant: '   ' })).toBe(false);
    expect(PaymentSettingsService.isOnlineReady({ ...ready, zibalCallbackUrl: '  ' })).toBe(false);
  });
});
