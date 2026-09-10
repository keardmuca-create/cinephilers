import type { MediaType } from '@/generated/prisma/client';

export type ListSide = 'movies' | 'shows' | 'episodes';

/** A ?side= query value, or null when it is absent or not one of the three. */
export function parseSide(value: string | null): ListSide | null {
  return value === 'movies' || value === 'shows' || value === 'episodes' ? value : null;
}

// The where-clause for one side of the Movies · Shows · Episodes pill, for a table
// keyed by tmdbId + mediaType (ratings, watchlist, reviews). An episode is filed
// under SHOW like its series, so mediaType alone would count saved episodes as
// shows. Episode ids are the only SHOW ids containing "-S": a series is tmdb-tv-{n},
// an episode tmdb-tv-{n}-S{s}E{e}.
export function sideWhere(side: ListSide) {
  if (side === 'movies') return { mediaType: 'MOVIE' as MediaType };
  if (side === 'episodes') return { mediaType: 'SHOW' as MediaType, tmdbId: { contains: '-S' } };
  return { mediaType: 'SHOW' as MediaType, NOT: { tmdbId: { contains: '-S' } } };
}
