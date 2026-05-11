
import { NextResponse } from 'next/server';
import { getPopularMovies, getPopularShows, getTrending } from '@/lib/tmdb';

export async function GET() {
  try {
    const [movies, shows, trending] = await Promise.all([
      getPopularMovies(),
      getPopularShows(),
      getTrending(),
    ]);
    return NextResponse.json({ movies, shows, trending });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
