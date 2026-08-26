import { describe, it, expect } from 'vitest';
import { hasWatched, matchesLens, lensCounts, lensRank, type FriendSignal } from './friend-lens';

const friend = (o: Partial<FriendSignal> = {}): FriendSignal => ({
  watched: false, rating: null, reviewed: false, inWatchlist: false, ...o,
});

describe('hasWatched', () => {
  it('counts a score or a review as having watched it', () => {
    expect(hasWatched(friend({ rating: 8 }))).toBe(true);
    expect(hasWatched(friend({ reviewed: true }))).toBe(true);
  });

  it('counts a part-way show', () => {
    expect(hasWatched(friend({ progress: '13 / 62' }))).toBe(true);
  });

  it('is false for a watchlist entry alone', () => {
    expect(hasWatched(friend({ inWatchlist: true }))).toBe(false);
  });
});

describe('matchesLens', () => {
  const rated = friend({ rating: 9, watched: true });

  it('shows everyone when no chip is on', () => {
    expect(matchesLens(friend({ inWatchlist: true }), null)).toBe(true);
  });

  it('narrows to the chosen slice', () => {
    expect(matchesLens(rated, 'rated')).toBe(true);
    expect(matchesLens(rated, 'reviewed')).toBe(false);
    expect(matchesLens(rated, 'watchlist')).toBe(false);
  });
});

describe('lensCounts', () => {
  // The case the page is designed around: one person in three counts at once.
  const entries = [
    friend({ watched: true, rating: 9, reviewed: true }),
    friend({ watched: true }),
    friend({ inWatchlist: true }),
  ];

  it('counts each signal independently', () => {
    expect(lensCounts(entries)).toEqual({
      all: 3, watched: 2, rated: 1, reviewed: 1, watchlist: 1,
    });
  });

  it('does not sum to the total, and that is correct', () => {
    const c = lensCounts(entries);
    expect(c.watched + c.rated + c.reviewed + c.watchlist).not.toBe(c.all);
  });
});

describe('lensRank', () => {
  it('puts the friends with most to say first', () => {
    const order = [
      friend({ inWatchlist: true }),
      friend({ watched: true }),
      friend({ rating: 7 }),
      friend({ reviewed: true }),
    ]
      .sort((a, b) => lensRank(a) - lensRank(b))
      .map(lensRank);
    expect(order).toEqual([0, 1, 2, 3]);
  });
});
