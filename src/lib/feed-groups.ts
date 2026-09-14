// How the activity feed folds a burst into one card, and how a card says what its
// titles are. Shared by the feed and the page a group card opens, so the card and
// the list behind it always count the same rows.
//
// A burst is two or more of the same thing from one person on one day: watchlist
// adds, or episodes of one show. It used to take three, which let a pair of adds or
// a two-episode evening take two cards where one says it better.

export type FeedSide = 'movies' | 'shows' | 'episodes';

/** The smallest burst that becomes one card. */
export const GROUP_AT = 2;

const EPISODE_ID = /^tmdb-tv-\d{1,10}-S\d{1,3}E\d{1,4}$/;

export function isEpisodeId(id: string): boolean {
  return EPISODE_ID.test(id);
}

/** `tmdb-tv-1396-S5E16` → `tmdb-tv-1396`. Anything else comes back unchanged. */
export function showOfEpisode(id: string): string {
  return id.replace(/-S\d{1,3}E\d{1,4}$/, '');
}

/**
 * The feed id of a watched-episode row: `tmdb-tv-1396-S5E16`, the same id a rating
 * or review of that episode carries, so ticking it and rating it fold into one card.
 * A show id saved bare by an older version is given its prefix first.
 */
export function episodeIdOf(showTmdbId: string, season: number, episode: number): string {
  const show = /^\d+$/.test(showTmdbId) ? `tmdb-tv-${showTmdbId}` : showTmdbId;
  return `${show}-S${season}E${episode}`;
}

/** Which of the three a title is. An episode is a SHOW row, so the id decides first. */
export function sideOfTitle(tmdbId: string, mediaType?: string): FeedSide {
  if (isEpisodeId(tmdbId)) return 'episodes';
  if (mediaType === 'SHOW' || tmdbId.startsWith('tmdb-tv-')) return 'shows';
  return 'movies';
}

export function countSides(rows: { tmdbId: string; mediaType?: string }[]): Record<FeedSide, number> {
  const counts: Record<FeedSide, number> = { movies: 0, shows: 0, episodes: 0 };
  for (const r of rows) counts[sideOfTitle(r.tmdbId, r.mediaType)]++;
  return counts;
}

/**
 * "12 movies · 3 shows". Never one mixed total: a count of movies and shows added
 * together describes neither. Sides with nothing are left out.
 */
export function sidesLabel(counts: Record<FeedSide, number>): string {
  const word = { movies: ['movie', 'movies'], shows: ['show', 'shows'], episodes: ['episode', 'episodes'] } as const;
  return (['movies', 'shows', 'episodes'] as FeedSide[])
    .filter(side => counts[side] > 0)
    .map(side => `${counts[side]} ${word[side][counts[side] === 1 ? 0 : 1]}`)
    .join(' · ');
}

/** The UTC day a burst is counted in. The card and its list must use the same one. */
export function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** A day key as the [start, end) it covers, or null for anything that is not a real date. */
export function dayRange(day: string): [Date, Date] | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const start = new Date(`${day}T00:00:00.000Z`);
  // 2026-02-30 parses as March 2nd; reading the key back catches it.
  if (Number.isNaN(start.getTime()) || dayKey(start) !== day) return null;
  return [start, new Date(start.getTime() + 24 * 60 * 60 * 1000)];
}

/**
 * Splits rows into the ones that stand alone and the bursts that fold into a card.
 * Rows sharing a key are one burst; a burst of fewer than GROUP_AT stays as singles.
 * Order within each is the order the rows came in.
 */
export function splitBursts<T>(rows: T[], keyOf: (row: T) => string): { singles: T[]; groups: { key: string; rows: T[] }[] } {
  const byKey = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const list = byKey.get(key);
    if (list) list.push(row);
    else byKey.set(key, [row]);
  }
  const singles: T[] = [];
  const groups: { key: string; rows: T[] }[] = [];
  for (const [key, list] of byKey) {
    if (list.length >= GROUP_AT) groups.push({ key, rows: list });
    else singles.push(...list);
  }
  return { singles, groups };
}
