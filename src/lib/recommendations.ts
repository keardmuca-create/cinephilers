import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth-utils';
import {
  getRecommendationsFor,
  getMoviesByGenre,
  getShowsByGenre,
  getTopRatedMovies,
  getTopRatedShows,
  genreNameToId,
} from '@/lib/tmdb';
import type { Movie } from '@/lib/types';

const WEIGHTED_MIN_VOTES = 100;
const GLOBAL_MEAN_RATING = 6.5;
function weightedScore(m: Movie): number {
  const v = m.votes ?? 0;
  const r = m.rating ?? 0;
  return (v / (v + WEIGHTED_MIN_VOTES)) * r
    + (WEIGHTED_MIN_VOTES / (v + WEIGHTED_MIN_VOTES)) * GLOBAL_MEAN_RATING;
}

// "MOVIE"/"SHOW" key from a Movie's id ("tmdb-123" / "tmdb-tv-456").
function libraryKey(m: Movie): string {
  const numeric = m.id.replace(/^tmdb-(?:tv-)?/, '');
  return `${m.type === 'show' ? 'SHOW' : 'MOVIE'}:${numeric}`;
}

export interface Recommendations {
  topMovies: Movie[];
  topShows: Movie[];
  personalized: boolean;
}

async function topRatedFallback(limit: number, includeShows: boolean): Promise<Recommendations> {
  const [topMovies, topShows] = await Promise.all([
    getTopRatedMovies(limit),
    includeShows ? getTopRatedShows(limit) : Promise.resolve([] as Movie[]),
  ]);
  return { topMovies, topShows, personalized: false };
}

// Tops a single media type up to `limit`, keeping the personalized picks first
// and filling gaps from favorite-genre titles then top-rated. Without this a
// movie-heavy user (whose seeds only yield movie recs) gets an empty Shows tab.
async function backfillType(
  existing: Movie[],
  type: 'movie' | 'show',
  limit: number,
  seen: Set<string>,
  favoriteGenres: string[] | undefined,
): Promise<Movie[]> {
  const out = new Map<string, Movie>();
  for (const m of existing) out.set(m.id, m);

  const add = (list: Movie[]) => {
    for (const m of list) {
      if (out.size >= limit) break;
      if (out.has(m.id) || seen.has(libraryKey(m))) continue;
      out.set(m.id, m);
    }
  };

  if (out.size < limit && favoriteGenres?.length) {
    const ids = favoriteGenres
      .map(genreNameToId)
      .filter((x): x is number => typeof x === 'number')
      .slice(0, 3);
    const lists = await Promise.all(
      ids.map(id => (type === 'movie' ? getMoviesByGenre(id, 20) : getShowsByGenre(id, 20))),
    );
    add(lists.flat().sort((a, b) => weightedScore(b) - weightedScore(a)));
  }

  if (out.size < limit) {
    add(type === 'movie' ? await getTopRatedMovies(limit + 20) : await getTopRatedShows(limit + 20));
  }

  return [...out.values()].slice(0, limit);
}

// Builds personalized Top Picks for the authed user, falling back to generic
// top-rated when there's no usable history. `limit` caps each list.
//
// Shows are off by default. Top Picks is a movies-only row now — a show is a
// dozen hours before you know whether the suggestion was any good, which is a far
// worse thing to be wrong about than a film. Backfilling the show side meant up
// to four extra TMDB round trips per request for a list nobody was going to see,
// so the caller has to ask for it.
export async function getRecommendations(
  req: NextRequest,
  limit = 20,
  includeShows = false,
): Promise<Recommendations> {
  const auth = await getCurrentUser(req);
  if (!auth) return topRatedFallback(limit, includeShows);
  const userId = auth.sub;

  const [ratings, watched, watchlist, favorites, user] = await Promise.all([
    prisma.rating.findMany({ where: { userId }, orderBy: { score: 'desc' }, take: 50 }),
    prisma.watchedItem.findMany({ where: { userId }, orderBy: { watchedAt: 'desc' }, take: 50, select: { tmdbId: true, mediaType: true } }),
    prisma.watchlistItem.findMany({ where: { userId }, select: { tmdbId: true, mediaType: true } }),
    prisma.favorite.findMany({ where: { userId }, select: { tmdbId: true, mediaType: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { favoriteGenres: true } }),
  ]);

  // Everything the user has already engaged with — never recommend these back.
  const seen = new Set<string>();
  for (const arr of [ratings, watched, watchlist, favorites]) {
    for (const x of arr) seen.add(`${x.mediaType}:${x.tmdbId}`);
  }

  // Seeds: titles the user liked. Prefer high ratings, then any rating, then
  // recently watched. Cap so we make at most ~6 TMDB recommendation calls.
  const highRated = ratings.filter(r => r.score >= 7);
  const seeds = (highRated.length ? highRated : ratings.length ? ratings : watched).slice(0, 6);

  let pool: Movie[] = [];
  if (seeds.length) {
    const lists = await Promise.all(seeds.map(s =>
      getRecommendationsFor(parseInt(s.tmdbId, 10), s.mediaType === 'SHOW' ? 'tv' : 'movie', 20),
    ));
    pool = lists.flat();
  }

  // Dedupe by id, drop anything already in the user's library.
  const byId = new Map<string, Movie>();
  for (const m of pool) {
    if (seen.has(libraryKey(m))) continue;
    if (!byId.has(m.id)) byId.set(m.id, m);
  }
  const recs = [...byId.values()];

  // No usable history at all → generic top-rated.
  if (recs.length === 0) return topRatedFallback(limit, includeShows);

  recs.sort((a, b) => weightedScore(b) - weightedScore(a));
  const movieRecs = recs.filter(m => m.type === 'movie');
  const showRecs = recs.filter(m => m.type === 'show');

  // Backfill each type independently so neither list is ever short.
  const [topMovies, topShows] = await Promise.all([
    backfillType(movieRecs, 'movie', limit, seen, user?.favoriteGenres),
    includeShows
      ? backfillType(showRecs, 'show', limit, seen, user?.favoriteGenres)
      : Promise.resolve([] as Movie[]),
  ]);

  return { topMovies, topShows, personalized: true };
}
