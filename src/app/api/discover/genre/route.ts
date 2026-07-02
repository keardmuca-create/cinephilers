import { NextRequest, NextResponse } from 'next/server';
import { getMoviesByGenre, getShowsByGenre } from '@/lib/tmdb';
import type { Movie } from '@/lib/types';
import { rateLimit, getIp } from '@/lib/rate-limit';
import { clampInt } from '@/lib/query-params';

export async function GET(req: NextRequest) {
  const { allowed } = await rateLimit(`tmdb:${getIp(req)}`, 120, 60_000);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const { searchParams } = new URL(req.url);
  const movieIdParam = searchParams.get('movieId');
  const tvIdParam = searchParams.get('tvId');
  const count = clampInt(searchParams.get('count'), 25, 1, 100);

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

    return NextResponse.json({ items }, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=600' },
    });
  } catch (err) {
    console.error('genre error:', err);
    return NextResponse.json({ error: 'Failed to load titles' }, { status: 500 });
  }
}
