import { describe, it, expect } from 'vitest';
import { collapseRatings, effectiveScore, parentShowId, ratingKind } from './collapse-ratings';

describe('ratingKind', () => {
  it('tells a film, a series and an episode apart', () => {
    expect(ratingKind('tmdb-550')).toBe('film');
    expect(ratingKind('tmdb-tv-1396')).toBe('show');
    expect(ratingKind('tmdb-tv-1396-S1E2')).toBe('episode');
  });

  // The badge counters matched key prefixes, so a rated episode also matched the
  // show prefix and counted as another show rated. 62 episodes read as 62 shows.
  it('does not count a rated episode as a rated show', () => {
    expect(ratingKind('tmdb-tv-1396-S5E16')).not.toBe('show');
  });

  it('does not count a rated show or episode as a film', () => {
    expect(ratingKind('tmdb-tv-1396')).not.toBe('film');
    expect(ratingKind('tmdb-tv-1396-S1E1')).not.toBe('film');
  });
});

describe('parentShowId', () => {
  it('reads the show out of an episode rating id', () => {
    expect(parentShowId('tmdb-tv-1396-S2E5')).toBe('tmdb-tv-1396');
  });

  it('returns null for a series rating', () => {
    expect(parentShowId('tmdb-tv-1396')).toBeNull();
  });

  it('returns null for a film', () => {
    expect(parentShowId('tmdb-550')).toBeNull();
  });
});

describe('collapseRatings', () => {
  it('leaves films alone, one row each', () => {
    const rows = collapseRatings([
      { id: 'tmdb-550', score: 9 },
      { id: 'tmdb-680', score: 8 },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.every(r => !r.isShow)).toBe(true);
    expect(rows[0].seriesRating).toBe(9);
  });

  it('folds 62 episode ratings into ONE show row', () => {
    const eps = Array.from({ length: 62 }, (_, i) => ({ id: `tmdb-tv-1396-S1E${i + 1}`, score: 8 }));
    const rows = collapseRatings(eps);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('tmdb-tv-1396');
    expect(rows[0].isShow).toBe(true);
    expect(rows[0].episodeCount).toBe(62);
  });

  it('keeps the series rating and the episode average apart', () => {
    const rows = collapseRatings([
      { id: 'tmdb-tv-1396', score: 9 },
      { id: 'tmdb-tv-1396-S1E1', score: 8 },
      { id: 'tmdb-tv-1396-S1E2', score: 9 },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].seriesRating).toBe(9);
    expect(rows[0].episodeCount).toBe(2);
    expect(rows[0].episodeAverage).toBe(8.5);
  });

  it('does not invent a series rating from episodes alone', () => {
    const rows = collapseRatings([
      { id: 'tmdb-tv-1396-S1E1', score: 8 },
      { id: 'tmdb-tv-1396-S1E2', score: 9 },
    ]);
    expect(rows[0].seriesRating).toBeUndefined();
    expect(rows[0].episodeAverage).toBe(8.5);
  });

  it('merges however the ratings arrive, episodes first or series first', () => {
    const seriesFirst = collapseRatings([
      { id: 'tmdb-tv-1396', score: 9 },
      { id: 'tmdb-tv-1396-S1E1', score: 7 },
    ]);
    const episodesFirst = collapseRatings([
      { id: 'tmdb-tv-1396-S1E1', score: 7 },
      { id: 'tmdb-tv-1396', score: 9 },
    ]);
    expect(seriesFirst).toHaveLength(1);
    expect(episodesFirst).toHaveLength(1);
    expect(seriesFirst[0].isShow).toBe(true);
    expect(episodesFirst[0].isShow).toBe(true);
    expect(episodesFirst[0].seriesRating).toBe(9);
    expect(episodesFirst[0].episodeAverage).toBe(7);
  });

  it('rounds the average to one decimal place', () => {
    const rows = collapseRatings([
      { id: 'tmdb-tv-9-S1E1', score: 8 },
      { id: 'tmdb-tv-9-S1E2', score: 9 },
      { id: 'tmdb-tv-9-S1E3', score: 9 },
    ]);
    expect(rows[0].episodeAverage).toBe(8.7);
  });

  it('sorts an episode-only show by its average, not as unrated', () => {
    const [row] = collapseRatings([
      { id: 'tmdb-tv-1396-S1E1', score: 8 },
      { id: 'tmdb-tv-1396-S1E2', score: 9 },
    ]);
    expect(effectiveScore(row)).toBe(8.5);
  });

  it('prefers what the user actually said about the series', () => {
    const [row] = collapseRatings([
      { id: 'tmdb-tv-1396', score: 10 },
      { id: 'tmdb-tv-1396-S1E1', score: 4 },
    ]);
    expect(effectiveScore(row)).toBe(10);
  });

  it('keeps every folded id', () => {
    const [row] = collapseRatings([
      { id: 'tmdb-tv-1396', score: 9 },
      { id: 'tmdb-tv-1396-S1E1', score: 8 },
    ]);
    expect(row.memberIds).toEqual(['tmdb-tv-1396', 'tmdb-tv-1396-S1E1']);
  });
});
