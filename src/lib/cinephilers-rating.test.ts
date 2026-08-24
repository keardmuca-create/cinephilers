import { describe, it, expect } from 'vitest';
import { resolveDisplayRating, MIN_CINEPHILERS_RATINGS } from './cinephilers-rating';

const enough = (average: number) => ({ average, hasEnough: true });
const notEnough = (average: number | null) => ({ average, hasEnough: false });

describe('resolveDisplayRating', () => {
  it('prefers the community score once it has enough votes', () => {
    expect(resolveDisplayRating(6.8, enough(8.4))).toEqual({ value: 8.4, source: 'cinephilers' });
  });

  it('falls back to TMDB below the vote threshold', () => {
    expect(resolveDisplayRating(6.8, notEnough(9.5))).toEqual({ value: 6.8, source: 'tmdb' });
  });

  it('falls back to TMDB when no community score has been fetched yet', () => {
    expect(resolveDisplayRating(7.2, null)).toEqual({ value: 7.2, source: 'tmdb' });
    expect(resolveDisplayRating(7.2, undefined)).toEqual({ value: 7.2, source: 'tmdb' });
  });

  it('returns null when there is nothing worth showing', () => {
    // The caller leaves the star off entirely rather than printing "0.0".
    expect(resolveDisplayRating(0, notEnough(null))).toBeNull();
    expect(resolveDisplayRating(undefined, null)).toBeNull();
    expect(resolveDisplayRating(null, undefined)).toBeNull();
  });

  it('ignores a community score of zero even when flagged as enough', () => {
    // count >= threshold with a zero average would mean everyone rated it 0,
    // which the aggregate cannot produce (scores are 1-10) — but a 0 must never
    // silently replace a real TMDB number if it ever appears.
    expect(resolveDisplayRating(6.1, enough(0))).toEqual({ value: 6.1, source: 'tmdb' });
  });

  it('shows the community score even when TMDB has none', () => {
    expect(resolveDisplayRating(undefined, enough(7.0))).toEqual({ value: 7.0, source: 'cinephilers' });
  });

  it('keeps the documented threshold at 5', () => {
    // The row and the film page must agree on when a title flips; this pins the
    // shared constant so a change is deliberate rather than incidental.
    expect(MIN_CINEPHILERS_RATINGS).toBe(5);
  });
});
