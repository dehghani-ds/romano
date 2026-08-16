import { describe, expect, it } from 'vitest';

import {
  isPaidStatus,
  isSettledResult,
  normalizeTrackId,
  parseZibalPaidAt,
  zibalResultMessage,
  zibalStatusMessage,
  ZIBAL_MIN_AMOUNT_RIAL,
  ZIBAL_RESULT_ALREADY_VERIFIED,
  ZIBAL_RESULT_OK,
  ZIBAL_STATUS_CANCELLED_BY_USER,
  ZIBAL_STATUS_PAID_UNVERIFIED,
  ZIBAL_STATUS_PAID_VERIFIED,
} from './zibal.protocol';

/**
 * These tables are the contract with a system we do not control, transcribed
 * from https://help.zibal.ir/ipg/. The tests pin the handful of readings that
 * decide whether an order is marked paid — every one of them is a way to take
 * someone's money and not deliver, or to deliver without being paid.
 */

describe('paid statuses', () => {
  it('counts both verified and unverified payments as paid', () => {
    // 2 is "paid, not yet verified" — the money has moved, and the whole point
    // of the verify call is to close a session that is already in this state.
    expect(isPaidStatus(ZIBAL_STATUS_PAID_VERIFIED)).toBe(true);
    expect(isPaidStatus(ZIBAL_STATUS_PAID_UNVERIFIED)).toBe(true);
  });

  it('does not count a cancellation as a payment', () => {
    expect(isPaidStatus(ZIBAL_STATUS_CANCELLED_BY_USER)).toBe(false);
  });

  it('does not count a pending or errored session as a payment', () => {
    expect(isPaidStatus(-1)).toBe(false);
    expect(isPaidStatus(-2)).toBe(false);
  });

  it('does not count any of the bank refusals as a payment', () => {
    // 4..12 are wrong card, no funds, wrong PIN, limits, switch errors.
    for (const status of [4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      expect(isPaidStatus(status), `status ${status}`).toBe(false);
    }
  });

  it('does not count a refunded or reversed transaction as a payment', () => {
    for (const status of [15, 16, 18]) {
      expect(isPaidStatus(status), `status ${status}`).toBe(false);
    }
  });

  it('does not count a missing status as a payment', () => {
    expect(isPaidStatus(undefined)).toBe(false);
  });
});

describe('settled results', () => {
  it('accepts a first verification', () => {
    expect(isSettledResult(ZIBAL_RESULT_OK)).toBe(true);
  });

  it('accepts a repeat verification', () => {
    // A callback arriving twice is ordinary — the payer refreshes, or a proxy
    // retries the redirect. Reading 201 as a failure would flip a paid order
    // back to unpaid.
    expect(isSettledResult(ZIBAL_RESULT_ALREADY_VERIFIED)).toBe(true);
  });

  it('rejects an unpaid order and an unknown session', () => {
    expect(isSettledResult(202)).toBe(false);
    expect(isSettledResult(203)).toBe(false);
  });

  it('rejects every merchant-configuration failure', () => {
    for (const result of [102, 103, 104]) {
      expect(isSettledResult(result), `result ${result}`).toBe(false);
    }
  });

  it('rejects a missing result', () => {
    expect(isSettledResult(undefined)).toBe(false);
  });
});

describe('messages', () => {
  it('answers in Persian for every documented result code', () => {
    for (const result of [100, 102, 103, 104, 105, 106, 113, 115, 201, 202, 203]) {
      expect(zibalResultMessage(result), `result ${result}`).toMatch(/[؀-ۿ]/);
    }
  });

  it('answers in Persian for every documented status code', () => {
    for (const status of [-2, -1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 16, 18, 21]) {
      expect(zibalStatusMessage(status), `status ${status}`).toMatch(/[؀-ۿ]/);
    }
  });

  it('still answers in Persian for a code the docs do not list', () => {
    // Zibal can add a code without telling us. A blank screen or an English
    // fallback would both be worse than a vague Persian sentence.
    expect(zibalResultMessage(999)).toMatch(/[؀-ۿ]/);
    expect(zibalStatusMessage(999)).toMatch(/[؀-ۿ]/);
    expect(zibalResultMessage(undefined)).toMatch(/[؀-ۿ]/);
    expect(zibalStatusMessage(undefined)).toMatch(/[؀-ۿ]/);
  });
});

describe('parseZibalPaidAt', () => {
  const fallback = new Date('2026-08-16T00:00:00.000Z');

  it('reads an offsetless timestamp as Tehran, not as server-local time', () => {
    // Zibal sends `2018-03-25T23:43:01.053000` with no zone on it. Read as UTC
    // that is 03:13 the next morning in Tehran — a payment stamped in the future
    // relative to when it happened.
    const parsed = parseZibalPaidAt('2018-03-25T23:43:01.053000', fallback);
    expect(parsed.toISOString()).toBe('2018-03-25T20:13:01.053Z');
  });

  it('leaves a timestamp that already carries an offset alone', () => {
    expect(parseZibalPaidAt('2018-03-25T23:43:01.053Z', fallback).toISOString()).toBe(
      '2018-03-25T23:43:01.053Z',
    );
    expect(parseZibalPaidAt('2018-03-25T23:43:01+04:30', fallback).toISOString()).toBe(
      '2018-03-25T19:13:01.000Z',
    );
  });

  it('falls back rather than storing an Invalid Date', () => {
    expect(parseZibalPaidAt(undefined, fallback)).toBe(fallback);
    expect(parseZibalPaidAt('', fallback)).toBe(fallback);
    expect(parseZibalPaidAt('not a date at all', fallback)).toBe(fallback);
  });
});

describe('normalizeTrackId', () => {
  it('keeps the digits exactly as they arrived', () => {
    // Carried as text because it is an int64: a big enough one loses precision
    // the moment it becomes a JavaScript number.
    expect(normalizeTrackId(15966442233311)).toBe('15966442233311');
    expect(normalizeTrackId('15966442233311')).toBe('15966442233311');
  });

  it('refuses anything that is not a Zibal id', () => {
    // This value reaches us on a query string the payer can edit, and it is the
    // key a payment is looked up by, so the shape is checked before the lookup.
    expect(normalizeTrackId('12; drop table payments')).toBeNull();
    expect(normalizeTrackId('../../etc/passwd')).toBeNull();
    expect(normalizeTrackId('')).toBeNull();
    expect(normalizeTrackId('-1')).toBeNull();
    expect(normalizeTrackId('1.5')).toBeNull();
    expect(normalizeTrackId(undefined)).toBeNull();
    // Longer than an int64 can be — the column's CHECK would refuse it anyway.
    expect(normalizeTrackId('123456789012345678901')).toBeNull();
  });
});

describe('gateway floor', () => {
  it('matches the minimum Zibal documents', () => {
    expect(ZIBAL_MIN_AMOUNT_RIAL).toBe(1_000);
  });
});
