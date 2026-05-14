import { NextResponse } from 'next/server';
import {
  getTopRatedMovies,
  getTopRatedShows,
  getUpcomingMovies,
  getMovieGenres,
  getTvGenres,
  type TmdbGenre,
} from '@/lib/tmdb';

export async function GET() {
  try {
    const [topMovies, topShows, upcoming, movieGenres, tvGenres] = await Promise.all([
      getTopRatedMovies(25),
      getTopRatedShows(25),
      getUpcomingMovies(25),
      getMovieGenres(),
      getTvGenres(),
    ]);

    // Merge genres — deduplicate by id, then skip exact-name dupes
    const seenIds = new Set<number>();
    const seenNames = new Set<string>();
    const genres: TmdbGenre[] = [];
    for (const g of [...movieGenres, ...tvGenres]) {
      if (!seenIds.has(g.id) && !seenNames.has(g.name)) {
        seenIds.add(g.id);
        seenNames.add(g.name);
        genres.push(g);
      }
    }

    return NextResponse.json({ topMovies, topShows, upcoming, genres });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
