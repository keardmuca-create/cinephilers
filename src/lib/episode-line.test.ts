import { describe, it, expect } from 'vitest';
import { episodeLineFor } from './episode-line';

describe('episodeLineFor', () => {
  it('names the season, episode and show', () => {
    expect(episodeLineFor('tmdb-tv-1402-S2E1', { showName: 'The Walking Dead' })).toBe('S2·E1 · The Walking Dead');
  });

  it('still says which episode before the meta has landed', () => {
    expect(episodeLineFor('tmdb-tv-1402-S2E11', null)).toBe('S2·E11');
  });

  it('has nothing to say about a film or a whole show', () => {
    expect(episodeLineFor('tmdb-2668', { showName: 'x' })).toBeUndefined();
    expect(episodeLineFor('tmdb-tv-94997', { showName: 'x' })).toBeUndefined();
  });
});
