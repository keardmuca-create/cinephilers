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

// Films and shows are different things, so every list splits into two sides that
// are counted and filtered separately — never mixed, and with no combined view.
// A TV Movie is a film you watch in one sitting, so it belongs on the Movies side
// despite the name; an episode belongs to its show.
export type MediaSide = 'movies' | 'shows';

export const SIDE_TYPES: Record<MediaSide, Exclude<TypeFilter, 'any'>[]> = {
  movies: ['movie', 'tv-movie', 'short'],
  shows: ['tv-series', 'tv-mini-series', 'tv-episode'],
};

export const SIDE_LABELS: Record<MediaSide, string> = { movies: 'Movies', shows: 'Shows' };

/** Which side of the toggle a classified item belongs to. */
export function sideOf(type: Exclude<TypeFilter, 'any'>): MediaSide {
  return SIDE_TYPES.shows.includes(type) ? 'shows' : 'movies';
}

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
