import { describe, it, expect } from 'vitest';
import { BADGES, BADGE_BY_ID, tierFor, nextThreshold, progressTo } from './badge-defs';

const T = { bronze: 100, silver: 500, gold: 1000 };

describe('tierFor', () => {
  it('earns nothing below bronze', () => {
    expect(tierFor(0, T)).toBeNull();
    expect(tierFor(99, T)).toBeNull();
  });

  it('earns each tier exactly at its threshold', () => {
    expect(tierFor(100, T)).toBe('bronze');
    expect(tierFor(500, T)).toBe('silver');
    expect(tierFor(1000, T)).toBe('gold');
  });

  it('stays gold beyond gold', () => {
    expect(tierFor(99999, T)).toBe('gold');
  });
});

describe('nextThreshold', () => {
  it('points at the next rung', () => {
    expect(nextThreshold(0, T)).toBe(100);
    expect(nextThreshold(100, T)).toBe(500);
    expect(nextThreshold(561, T)).toBe(1000);
  });

  it('is null once gold is reached, since there is nothing left to climb', () => {
    expect(nextThreshold(1000, T)).toBeNull();
  });
});

describe('progressTo', () => {
  it('measures from zero toward bronze', () => {
    expect(progressTo(0, T)).toBe(0);
    expect(progressTo(50, T)).toBe(0.5);
  });

  it('measures from the tier below, not from zero', () => {
    // 300 of the way from bronze (100) to silver (500) is halfway, not 60%.
    expect(progressTo(300, T)).toBe(0.5);
  });

  it('is full at gold', () => {
    expect(progressTo(1000, T)).toBe(1);
    expect(progressTo(5000, T)).toBe(1);
  });

  it('never leaves 0–1', () => {
    expect(progressTo(-10, T)).toBe(0);
  });
});

describe('the badge set', () => {
  it('has nine badges with unique ids', () => {
    expect(BADGES).toHaveLength(9);
    expect(BADGE_BY_ID.size).toBe(9);
  });

  it('gives every badge but Founder a rising set of tiers', () => {
    for (const b of BADGES) {
      if (b.id === 'founder') { expect(b.tiers).toBeUndefined(); continue; }
      expect(b.tiers).toBeDefined();
      expect(b.tiers!.bronze).toBeLessThan(b.tiers!.silver);
      expect(b.tiers!.silver).toBeLessThan(b.tiers!.gold);
    }
  });

  // Keard's numbers the day this was built, as a sanity check on the thresholds.
  it('places a real library where expected', () => {
    const film = BADGE_BY_ID.get('movie-watcher')!.tiers!;
    const show = BADGE_BY_ID.get('show-watcher')!.tiers!;
    expect(tierFor(561, film)).toBe('silver');
    expect(tierFor(6, show)).toBeNull();
    expect(progressTo(6, show)).toBeCloseTo(0.6);
  });
});
