import { NextRequest, NextResponse } from 'next/server';
import {
  getPopularMoviesPaged,
  getPopularShowsEnriched,
  getTopRatedMovies,
  getTopRatedShows,
  getUpcomingMovies,
  getUpcomingShows,
  getMoviesByGenre,
  getShowsByGenre,
} from '@/lib/tmdb';
import type { Movie } from '@/lib/types';
import { seededShuffle } from '@/lib/seed-shuffle';
import { getDailyPool } from '@/lib/home-pool';
import { getRecommendations } from '@/lib/recommendations';
import { rateLimit, getIp } from '@/lib/rate-limit';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ section: string }> },
) {
  // Each section fans out to dozens of TMDB calls (popular-shows enriches ~100
  // titles), so this is the most expensive unauthenticated route — cap it hard.
  const { allowed } = await rateLimit(`seeall:${getIp(req)}`, 30, 60_000);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const { section } = await params;

  // Every section is the same for all viewers EXCEPT top-picks-*, which builds
  // from the caller's auth cookie — CDN-caching those would serve one user's
  // recommendations to everyone. The rest can be served from the CDN for an
  // hour, skipping this function's ~100-fetch TMDB fan-out entirely.
  const isPersonalized = section.startsWith('top-picks-');
  const cacheHeaders = isPersonalized
    ? undefined
    : { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=600' };

  try {
    let items: Movie[];

    // Combined genre: genre-{movieId}-{tvId}  (tvId=0 means movies only)
    const genreMatch = section.match(/^genre-(\d+)-(\d+)$/);
    if (genreMatch) {
      const movieId = parseInt(genreMatch[1], 10);
      const tvId = parseInt(genreMatch[2], 10);
      if (tvId > 0) {
        const [movies, shows] = await Promise.all([
          getMoviesByGenre(movieId, 50),
          getShowsByGenre(tvId, 50),
        ]);
        items = [...movies, ...shows].sort((a, b) => b.rating - a.rating).slice(0, 100);
      } else {
        items = await getMoviesByGenre(movieId, 100);
      }
      return NextResponse.json({ items }, { headers: cacheHeaders });
    }

    switch (section) {
      case 'featured': {
        // Same pool + seed as home page so the lists always match exactly
        const pool = await getDailyPool();
        const now = new Date();
        const daySeed = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
        items = seededShuffle(pool, daySeed).slice(1, 101);
        break;
      }
      // No 'top-10-week'. It belonged to the old Top 10 row and served a seeded
      // shuffle of trending and popular titles — nothing to do with what anyone
      // had watched. Nothing linked to it, and after the row became Most Watched
      // This Week the page would have claimed to rank real activity over a random
      // list. Most Watched is ten titles by design and needs no See All; this
      // comes back when there are enough daily users to rank a hundred.
      case 'popular-movies':
        items = await getPopularMoviesPaged(100);
        break;
      case 'popular-shows':
        items = await getPopularShowsEnriched(100);
        break;
      case 'top-rated-movies':
        items = await getTopRatedMovies(100);
        break;
      case 'top-rated-shows':
        items = await getTopRatedShows(100);
        break;
      case 'coming-soon':
        items = await getUpcomingMovies(100);
        break;
      case 'coming-soon-shows':
        items = await getUpcomingShows(100);
        break;
      // No `top-picks-shows` — Top Picks is films only, and the row that linked
      // here is gone.
      case 'top-picks-movies': {
        const recs = await getRecommendations(req, 100);
        items = recs.topMovies;
        break;
      }
      default:
        return NextResponse.json({ error: 'Unknown section' }, { status: 404 });
    }
    return NextResponse.json({ items }, { headers: cacheHeaders });
  } catch (err) {
    console.error('see-all error:', err);
    return NextResponse.json({ error: 'Failed to load section' }, { status: 500 });
  }
}
