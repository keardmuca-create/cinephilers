
import { NextRequest, NextResponse } from 'next/server';
import { getPopularMoviesPaged, getPopularShowsPaged, getTrendingPaged } from '@/lib/tmdb';

export async function GET(req: NextRequest) {
  const count = Math.min(Math.max(parseInt(new URL(req.url).searchParams.get('count') ?? '25', 10), 1), 100);
  try {
    const [movies, shows, trending] = await Promise.all([
      getPopularMoviesPaged(count),
      getPopularShowsPaged(count),
      getTrendingPaged(count),
    ]);
    return NextResponse.json({ movies, shows, trending });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
