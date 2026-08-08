import { describe, it, expect } from 'vitest';
import { localDay, utcDay, isValidTimeZone, daysBetween } from './local-day';

describe('localDay', () => {
  it('falls back to UTC when no zone is known', () => {
    const at = new Date('2026-08-08T23:30:00Z');
    expect(localDay(null, at)).toBe('2026-08-08');
    expect(localDay(undefined, at)).toBe('2026-08-08');
    expect(localDay('', at)).toBe('2026-08-08');
  });

  it('falls back to UTC rather than throwing on a nonsense zone', () => {
    const at = new Date('2026-08-08T23:30:00Z');
    expect(localDay('Not/AZone', at)).toBe('2026-08-08');
  });

  // The case that started all this: Keard is UTC+2, so the hours either side of
  // UTC midnight belong to a different date for him than for the server.
  it('is already tomorrow east of Greenwich late at night', () => {
    const at = new Date('2026-08-08T23:30:00Z'); // 01:30 on the 9th in Tirana
    expect(utcDay(at)).toBe('2026-08-08');
    expect(localDay('Europe/Tirane', at)).toBe('2026-08-09');
  });

  // And the mirror image: UTC midnight lands mid-afternoon in California, which
  // is what let a west-coast user roll a second pick in one evening.
  it('is still yesterday west of Greenwich after UTC midnight', () => {
    const at = new Date('2026-08-09T01:00:00Z'); // 18:00 on the 8th in LA
    expect(utcDay(at)).toBe('2026-08-09');
    expect(localDay('America/Los_Angeles', at)).toBe('2026-08-08');
  });

  it('keeps the boundary at local midnight across a daylight-saving change', () => {
    // UK clocks go back at 02:00 on 26 Oct 2025. 23:30 local is the 26th on both
    // sides of the change, which a fixed offset would have got wrong.
    expect(localDay('Europe/London', new Date('2025-10-26T22:30:00Z'))).toBe('2025-10-26');
    expect(localDay('Europe/London', new Date('2025-10-25T22:30:00Z'))).toBe('2025-10-25');
  });
});

describe('isValidTimeZone', () => {
  it('accepts real IANA names', () => {
    expect(isValidTimeZone('Europe/Tirane')).toBe(true);
    expect(isValidTimeZone('America/Los_Angeles')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isValidTimeZone('Middle/Earth')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone(null)).toBe(false);
    expect(isValidTimeZone(42)).toBe(false);
    expect(isValidTimeZone('x'.repeat(200))).toBe(false);
  });
});

describe('daysBetween', () => {
  it('counts consecutive days as one apart', () => {
    expect(daysBetween('2026-08-08', '2026-08-09')).toBe(1);
  });

  it('counts the same day as zero', () => {
    expect(daysBetween('2026-08-08', '2026-08-08')).toBe(0);
  });

  it('crosses month and year boundaries', () => {
    expect(daysBetween('2026-08-31', '2026-09-01')).toBe(1);
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
  });

  it('handles a leap day', () => {
    expect(daysBetween('2028-02-28', '2028-02-29')).toBe(1);
    expect(daysBetween('2028-02-29', '2028-03-01')).toBe(1);
  });

  // A streak must not survive a gap, so this is the value the check depends on.
  it('reports a gap as more than one', () => {
    expect(daysBetween('2026-08-08', '2026-08-10')).toBe(2);
  });
});
