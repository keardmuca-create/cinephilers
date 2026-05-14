import { NextRequest, NextResponse } from 'next/server';
import { getMoviesByGenre, getShowsByGenre } from '@/lib/tmdb';
import type { Movie } from '@/lib/types';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const movieIdParam = searchParams.get('movieId');
  const tvIdParam = searchParams.get('tvId');
  const count = Math.min(Math.max(parseInt(searchParams.get('count') ?? '25', 10), 1), 100);

  const movieId = parseInt(movieIdParam ?? '', 10);
  const tvId = parseInt(tvIdParam ?? '0', 10);

  if (!movieIdParam || isNaN(movieId)) {
    return NextResponse.json({ error: 'Missing or invalid movieId' }, { status: 400 });
  }

  try {
    let items: Movie[];

    if (tvId > 0) {
      // Fetch movies and shows in parallel, merge sorted by rating
      const fetchCount = Math.ceil(count * 0.65);
      const [movies, shows] = await Promise.all([
        getMoviesByGenre(movieId, fetchCount),
        getShowsByGenre(tvId, fetchCount),
      ]);
      // Combine, sort by rating descending, trim to requested count
      items = [...movies, ...shows]
        .sort((a, b) => b.rating - a.rating)
        .slice(0, count);
    } else {
      // No TV genre for this category — movies only
      items = await getMoviesByGenre(movieId, count);
    }

    return NextResponse.json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
