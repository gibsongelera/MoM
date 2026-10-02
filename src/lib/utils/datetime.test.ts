import { describe, expect, it } from 'vitest';
import { fromManilaInput, manilaDateKey, manilaMonthRange, startOfManilaDay, toManilaInput } from './datetime';

describe('Manila date helpers', () => {
  it('round-trips a datetime-local value regardless of the host zone', () => {
    const iso = fromManilaInput('2026-10-08T14:00');
    expect(iso).toBe('2026-10-08T06:00:00.000Z');
    expect(toManilaInput(iso)).toBe('2026-10-08T14:00');
  });

  it('puts an early-morning Manila meeting on the right calendar day', () => {
    // 07:30 Manila on Oct 8 is still Oct 7 in UTC.
    const iso = fromManilaInput('2026-10-08T07:30');
    expect(iso.startsWith('2026-10-07')).toBe(true);
    expect(manilaDateKey(iso)).toBe('2026-10-08');
  });

  it('computes the start of the Manila day across UTC midnight', () => {
    const lateUtc = new Date('2026-10-07T20:00:00Z'); // 04:00 on Oct 8 in Manila
    expect(startOfManilaDay(lateUtc).toISOString()).toBe('2026-10-07T16:00:00.000Z');
  });
});


describe('manilaMonthRange', () => {
  it('starts at Manila midnight on the 1st, in UTC', () => {
    expect(manilaMonthRange(2026, 9)).toEqual({
      start: '2026-09-30T16:00:00.000Z',
      end: '2026-10-31T16:00:00.000Z',
    });
  });

  it('rolls over December', () => {
    expect(manilaMonthRange(2026, 11).end).toBe('2026-12-31T16:00:00.000Z');
  });
});
