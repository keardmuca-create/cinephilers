import { describe, it, expect } from 'vitest';
import { splitBursts, sideOfTitle, countSides, sidesLabel, dayWindow, isEpisodeId, showOfEpisode, episodeIdOf, GROUP_AT } from './feed-groups';
import { localDay } from './local-day';

// Ticking an episode and rating it must land on the same card, so the id built
// from a watched-episode row has to be the one a rating of that episode carries.
describe('episodeIdOf', () => {
  it('builds the id a rating of the episode uses', () => {
    expect(episodeIdOf('tmdb-tv-1396', 5, 16)).toBe('tmdb-tv-1396-S5E16');
    expect(isEpisodeId(episodeIdOf('tmdb-tv-1396', 5, 16))).toBe(true);
  });

  it('gives a show id saved as a bare number its prefix', () => {
    expect(episodeIdOf('1396', 1, 2)).toBe('tmdb-tv-1396-S1E2');
  });
});

// The page a group card opens asks for one of its owner's days. The window has to
// hold that day wherever they live, and refuse anything that is not a date.
describe('dayWindow', () => {
  it("holds a day in Tirana, where it starts while UTC is still on yesterday", () => {
    const [from, to] = dayWindow('2026-09-15')!;
    const justAfterMidnightInTirana = new Date('2026-09-14T22:30:00.000Z'); // 00:30 on the 15th
    expect(localDay('Europe/Tirane', justAfterMidnightInTirana)).toBe('2026-09-15');
    expect(justAfterMidnightInTirana >= from && justAfterMidnightInTirana < to).toBe(true);
  });

  it('holds a day on the far side of the Pacific too', () => {
    const [from, to] = dayWindow('2026-09-15')!;
    const lateInPagoPago = new Date('2026-09-16T10:30:00.000Z'); // 23:30 on the 15th at UTC-11
    expect(localDay('Pacific/Pago_Pago', lateInPagoPago)).toBe('2026-09-15');
    expect(lateInPagoPago >= from && lateInPagoPago < to).toBe(true);
  });

  it('refuses what is not a real date', () => {
    expect(dayWindow('2026-02-30')).toBeNull();
    expect(dayWindow('yesterday')).toBeNull();
    expect(dayWindow('2026-9-15')).toBeNull();
  });
});

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
      { user: 'a', day: '2026-09-15'.replace('15', '14') },
      { user: 'b', day: '2026-09-15' },
    ], key);
    expect(singles).toHaveLength(3);
    expect(groups).toHaveLength(0);
  });

  // Keard, 2026-09-15: "even if it passes 12 am it should count towards new day".
  // Keyed by the person's own day, 01:30 and 02:30 in Tirana are one night even
  // though UTC puts them on different dates — and 23:30 is the day before.
  it("counts a late night by the person's own day, not UTC's", () => {
    const tz = 'Europe/Tirane';
    const at = (iso: string) => ({ user: 'keard', day: localDay(tz, new Date(iso)) });
    const { singles, groups } = splitBursts([
      at('2026-09-14T21:30:00.000Z'), // 23:30 on the 14th
      at('2026-09-14T23:30:00.000Z'), // 01:30 on the 15th (UTC: the 14th)
      at('2026-09-15T00:30:00.000Z'), // 02:30 on the 15th (UTC: the 15th)
    ], key);
    expect(groups).toHaveLength(1);
    expect(groups[0].rows.map(r => r.day)).toEqual(['2026-09-15', '2026-09-15']);
    expect(singles.map(r => r.day)).toEqual(['2026-09-14']);
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

describe('ids', () => {
  it('finds the show an episode belongs to', () => {
    expect(isEpisodeId('tmdb-tv-1396-S5E16')).toBe(true);
    expect(isEpisodeId('tmdb-tv-1396')).toBe(false);
    expect(showOfEpisode('tmdb-tv-1396-S5E16')).toBe('tmdb-tv-1396');
  });
});
