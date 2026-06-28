// The media kinds we let users filter lists by. Shared across Watch History,
// Watchlist, and Ratings so all three classify and label types identically.
export type TypeFilter =
  | 'any' | 'movie' | 'tv-series' | 'tv-mini-series' | 'tv-movie' | 'tv-episode' | 'short';

export const TYPE_LABELS: Record<TypeFilter, string> = {
  any: 'Any', movie: 'Movie', 'tv-series': 'TV Series',
  'tv-mini-series': 'TV Mini Series', 'tv-movie': 'TV Movie',
  'tv-episode': 'TV Episode', short: 'Short',
};

// Display order for the Type list (Any always first).
export const TYPE_ORDER: TypeFilter[] = [
  'any', 'movie', 'tv-series', 'tv-mini-series', 'tv-movie', 'tv-episode', 'short',
];

// Classify a film/show from its cached metadata.
export function getItemType(
  meta: { isEpisode?: boolean; type?: 'movie' | 'show'; showType?: string; genre?: string; runtime?: number },
): Exclude<TypeFilter, 'any'> {
  if (meta.isEpisode) return 'tv-episode';
  if (meta.type === 'show') {
    const st = (meta.showType ?? '').toLowerCase();
    if (st === 'miniseries' || st.includes('mini')) return 'tv-mini-series';
    return 'tv-series';
  }
  const genres = meta.genre ?? '';
  if (genres.includes('TV Movie')) return 'tv-movie';
  if (genres.includes('Short')) return 'short';
  // TMDB has no "Short" genre — shorts are defined by runtime (<=40 min).
  if (typeof meta.runtime === 'number' && meta.runtime > 0 && meta.runtime <= 40) return 'short';
  return 'movie';
}
