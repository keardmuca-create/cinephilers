import { describe, it, expect } from 'vitest';
import { splitBursts, sideOfTitle, countSides, sidesLabel, dayKey, isEpisodeId, showOfEpisode, GROUP_AT } from './feed-groups';

describe('splitBursts', () => {
  const key = (r: { user: string; day: string }) => `${r.user}:${r.day}`;

  it('leaves one add on its own', () => {
    const { singles, groups } = splitBursts([{ user: 'a', day: '2026-09-15' }], key);
    expect(singles).toHaveLength(1);
    expect(groups).toHaveLength(0);
  });

  // Keard, 2026-09-15: two adds or two episodes are already a burst.
  it('folds two from the same person on the same day into one group', () => {
    expect(GROUP_AT).toBe(2);
    const { singles, groups } = splitBursts([{ user: 'a', day: '2026-09-15' }, { user: 'a', day: '2026-09-15' }], key);
    expect(singles).toHaveLength(0);
    expect(groups).toHaveLength(1);
    expect(groups[0].rows).toHaveLength(2);
  });

  it('keeps different people and different days apart', () => {
    const { singles, groups } = splitBursts([
      { user: 'a', day: '2026-09-15' },
      { user: 'b', day: '2026-09-15' },
      { user: 'a', day: '2026-09-14' },
    ], key);
    expect(singles).toHaveLength(3);
    expect(groups).toHaveLength(0);
  });
});

describe('sideOfTitle', () => {
  it('tells a movie, a show and an episode apart', () => {
    expect(sideOfTitle('tmdb-155', 'MOVIE')).toBe('movies');
    expect(sideOfTitle('tmdb-tv-1396', 'SHOW')).toBe('shows');
    // An episode is stored as a SHOW row; its id is what says episode.
    expect(sideOfTitle('tmdb-tv-1396-S5E16', 'SHOW')).toBe('episodes');
  });

  it('works from the id alone, as the cards have no media type', () => {
    expect(sideOfTitle('tmdb-155')).toBe('movies');
    expect(sideOfTitle('tmdb-tv-1396')).toBe('shows');
    expect(sideOfTitle('tmdb-tv-1396-S1E1')).toBe('episodes');
  });
});

describe('sidesLabel', () => {
  it('splits the count and never mixes the three', () => {
    const counts = countSides([
      { tmdbId: 'tmdb-1', mediaType: 'MOVIE' },
      { tmdbId: 'tmdb-2', mediaType: 'MOVIE' },
      { tmdbId: 'tmdb-tv-3', mediaType: 'SHOW' },
    ]);
    expect(sidesLabel(counts)).toBe('2 movies · 1 show');
  });

  it('leaves out a side with nothing on it and says episodes as episodes', () => {
    expect(sidesLabel({ movies: 0, shows: 0, episodes: 4 })).toBe('4 episodes');
    expect(sidesLabel({ movies: 1, shows: 0, episodes: 1 })).toBe('1 movie · 1 episode');
  });
});

describe('ids and days', () => {
  it('finds the show an episode belongs to', () => {
    expect(isEpisodeId('tmdb-tv-1396-S5E16')).toBe(true);
    expect(isEpisodeId('tmdb-tv-1396')).toBe(false);
    expect(showOfEpisode('tmdb-tv-1396-S5E16')).toBe('tmdb-tv-1396');
  });

  it('counts a burst in the UTC day, the same for the card and its list', () => {
    expect(dayKey(new Date('2026-09-15T23:30:00.000Z'))).toBe('2026-09-15');
  });
});
