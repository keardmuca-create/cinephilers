import { NextResponse } from 'next/server';
import { getTopRatedMovies, getTopRatedShows, getUpcomingMovies } from '@/lib/tmdb';

export async function GET() {
  try {
    const [topMovies, topShows, upcoming] = await Promise.all([
      getTopRatedMovies(25),
      getTopRatedShows(25),
      getUpcomingMovies(25),
    ]);
    return NextResponse.json({ topMovies, topShows, upcoming });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
