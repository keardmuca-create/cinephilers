import { describe, it, expect } from 'vitest';
import { collapseShows, parentShowId, type CollapseInput } from './collapse-shows';

const ep = (showId: string, s: number, e: number, watchedAt: string, extra: Partial<CollapseInput> = {}): CollapseInput => ({
  id: `${showId}-S${s}E${e}`,
  showId,
  isEpisode: true,
  watchedAt,
  ...extra,
});

describe('parentShowId', () => {
  it('reads the parent from the id shape when meta has not loaded', () => {
    expect(parentShowId({ id: 'tmdb-tv-1396-S2E5', watchedAt: '2026-01-01' })).toBe('tmdb-tv-1396');
  });

  it('returns null for a film', () => {
    expect(parentShowId({ id: 'tmdb-550', watchedAt: '2026-01-01' })).toBeNull();
  });

  it('does not mistake a show for an episode', () => {
    expect(parentShowId({ id: 'tmdb-tv-1396', watchedAt: '2026-01-01' })).toBeNull();
  });
});

describe('collapseShows', () => {
  it('leaves films alone, one row each', () => {
    const rows = collapseShows([
      { id: 'tmdb-550', watchedAt: '2026-01-02' },
      { id: 'tmdb-680', watchedAt: '2026-01-01' },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.every(r => !r.isShow)).toBe(true);
  });

  it('folds every episode of a show into a single row', () => {
    const rows = collapseShows([
      ep('tmdb-tv-1396', 1, 1, '2026-01-01', { totalEpisodes: 62, showStatus: 'Ended' }),
      ep('tmdb-tv-1396', 1, 2, '2026-01-02'),
      ep('tmdb-tv-1396', 1, 3, '2026-01-03'),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('tmdb-tv-1396');
    expect(rows[0].watchedEpisodes).toBe(3);
    expect(rows[0].totalEpisodes).toBe(62);
  });

  it('merges a show entry and its episodes into ONE row, not two', () => {
    const rows = collapseShows([
      { id: 'tmdb-tv-1396', totalEpisodes: 62, showStatus: 'Ended', watchedAt: '2026-01-01' },
      ep('tmdb-tv-1396', 1, 1, '2026-01-05'),
      ep('tmdb-tv-1396', 1, 2, '2026-01-06'),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].watchedEpisodes).toBe(2);
  });

  it('takes the most recent episode date, so the row rises as you watch', () => {
    const rows = collapseShows([
      { id: 'tmdb-550', watchedAt: '2026-03-01' },
      ep('tmdb-tv-1396', 1, 1, '2026-01-01', { totalEpisodes: 62 }),
      ep('tmdb-tv-1396', 1, 2, '2026-06-01'),
    ]);
    expect(rows[0].id).toBe('tmdb-tv-1396');
    expect(rows[0].watchedAt).toBe('2026-06-01');
  });

  it('is Completed only when the series has ended', () => {
    const all = Array.from({ length: 4 }, (_, i) => ep('tmdb-tv-9', 1, i + 1, '2026-01-01'));
    all[0].totalEpisodes = 4;
    all[0].showStatus = 'Ended';
    expect(collapseShows(all)[0].status).toBe('completed');
  });

  it('is Up to date when a running series has nothing left aired', () => {
    const all = Array.from({ length: 4 }, (_, i) => ep('tmdb-tv-9', 1, i + 1, '2026-01-01'));
    all[0].totalEpisodes = 4;
    all[0].showStatus = 'Returning Series';
    expect(collapseShows(all)[0].status).toBe('up-to-date');
  });

  it('is Watching while episodes remain', () => {
    const rows = collapseShows([
      ep('tmdb-tv-1396', 1, 1, '2026-01-01', { totalEpisodes: 62, showStatus: 'Ended' }),
    ]);
    expect(rows[0].status).toBe('watching');
    expect(rows[0].watchedEpisodes).toBe(1);
  });
});
