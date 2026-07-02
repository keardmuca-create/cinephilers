import { NextRequest, NextResponse } from 'next/server';
import { getTopRatedMovies, getTopRatedShows, getUpcomingMovies, getUpcomingShows } from '@/lib/tmdb';
import { rateLimit, getIp } from '@/lib/rate-limit';

export async function GET(req: NextRequest) {
  const { allowed } = await rateLimit(`tmdb:${getIp(req)}`, 120, 60_000);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  try {
    const [topMovies, topShows, upcoming, upcomingShows] = await Promise.all([
      getTopRatedMovies(25),
      getTopRatedShows(25),
      getUpcomingMovies(25),
      getUpcomingShows(25),
    ]);
    return NextResponse.json({ topMovies, topShows, upcoming, upcomingShows }, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=600' },
    });
  } catch (err) {
    console.error('browse error:', err);
    return NextResponse.json({ error: 'Failed to load titles' }, { status: 500 });
  }
}
