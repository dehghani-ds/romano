import { describe, expect, it } from 'vitest';

import { addDays, dateToIso, isFutureDay, isoToDate, isoToYymmdd, tehranToday, tehranTomorrow } from './tehran';

describe('tehran dates', () => {
  it('reports the Tehran day, not the UTC day', () => {
    // 21:00 UTC on the 26th is already 00:30 on the 27th in Tehran (+03:30).
    const lateUtc = new Date('2026-07-26T21:00:00.000Z');
    expect(tehranToday(lateUtc)).toBe('2026-07-27');

    const earlierUtc = new Date('2026-07-26T19:00:00.000Z');
    expect(tehranToday(earlierUtc)).toBe('2026-07-26');
  });

  it('defaults delivery to the next Tehran day', () => {
    expect(tehranTomorrow(new Date('2026-07-26T08:00:00.000Z'))).toBe('2026-07-27');
  });

  it('rolls over month and year boundaries', () => {
    expect(addDays('2026-07-31', 1)).toBe('2026-08-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29'); // leap year
  });

  it('round-trips through the database representation', () => {
    expect(dateToIso(isoToDate('2026-07-27'))).toBe('2026-07-27');
  });

  it('builds the order-number date prefix', () => {
    expect(isoToYymmdd('2026-07-26')).toBe('260726');
  });

  describe('isFutureDay', () => {
    const now = new Date('2026-07-26T08:00:00.000Z'); // 2026-07-26 in Tehran

    it('accepts tomorrow and later', () => {
      expect(isFutureDay('2026-07-27', now)).toBe(true);
      expect(isFutureDay('2026-08-01', now)).toBe(true);
    });

    it('rejects today and the past — an order is always for a future day', () => {
      expect(isFutureDay('2026-07-26', now)).toBe(false);
      expect(isFutureDay('2026-07-25', now)).toBe(false);
    });
  });
});
