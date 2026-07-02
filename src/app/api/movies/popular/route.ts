
import { NextRequest, NextResponse } from 'next/server';
import { getPopularMoviesPaged, getPopularShowsPaged, getTrendingPaged } from '@/lib/tmdb';
import { rateLimit, getIp } from '@/lib/rate-limit';
import { clampInt } from '@/lib/query-params';

export async function GET(req: NextRequest) {
  const { allowed } = await rateLimit(`tmdb:${getIp(req)}`, 120, 60_000);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const count = clampInt(new URL(req.url).searchParams.get('count'), 25, 1, 100);
  try {
    const [movies, shows, trending] = await Promise.all([
      getPopularMoviesPaged(count),
      getPopularShowsPaged(count),
      getTrendingPaged(count),
    ]);
    return NextResponse.json({ movies, shows, trending }, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=600' },
    });
  } catch (err) {
    console.error('popular error:', err);
    return NextResponse.json({ error: 'Failed to load titles' }, { status: 500 });
  }
}
