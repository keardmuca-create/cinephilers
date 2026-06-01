import { NextRequest, NextResponse } from 'next/server';
import {
  getPopularMoviesPaged,
  getPopularShowsEnriched,
  getTrendingPaged,
  getTopRatedMovies,
  getTopRatedShows,
  getUpcomingMovies,
  getUpcomingShows,
  getMoviesByGenre,
  getShowsByGenre,
} from '@/lib/tmdb';
import type { Movie } from '@/lib/types';
import { seededShuffle, dedup, DAY_MS, WEEK_MS } from '@/lib/seed-shuffle';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ section: string }> },
) {
  const { section } = await params;

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
      return NextResponse.json({ items });
    }

    switch (section) {
      case 'featured': {
        // Same pool + seed as home page so lists always match
        const [trending, movies, shows] = await Promise.all([
          getTrendingPaged(40),
          getPopularMoviesPaged(40),
          getPopularShowsEnriched(40),
        ]);
        const pool = dedup([...trending, ...movies, ...shows]);
        const daySeed = Math.floor(Date.now() / DAY_MS);
        items = seededShuffle(pool, daySeed).slice(1, 101);
        break;
      }
      case 'top-10-week': {
        const [trending, movies, shows] = await Promise.all([
          getTrendingPaged(40),
          getPopularMoviesPaged(40),
          getPopularShowsEnriched(40),
        ]);
        const pool = dedup([...trending, ...movies, ...shows]);
        const weekSeed = Math.floor(Date.now() / WEEK_MS) + 99_999;
        items = seededShuffle(pool, weekSeed).slice(0, 100);
        break;
      }
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
      default:
        return NextResponse.json({ error: 'Unknown section' }, { status: 404 });
    }
    return NextResponse.json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
