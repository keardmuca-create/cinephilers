import { NextRequest, NextResponse } from 'next/server';
import {
  getPopularMoviesPaged,
  getPopularShowsEnriched,
  getTrendingPaged,
  getTopRatedMovies,
  getTopRatedShows,
  getUpcomingMovies,
  getMoviesByGenre,
  getShowsByGenre,
} from '@/lib/tmdb';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ section: string }> },
) {
  const { section } = await params;

  try {
    let items;

    // Genre sections: genre-movie-{id} or genre-tv-{id}
    const genreMatch = section.match(/^genre-(movie|tv)-(\d+)$/);
    if (genreMatch) {
      const type = genreMatch[1] as 'movie' | 'tv';
      const genreId = parseInt(genreMatch[2], 10);
      items = type === 'tv'
        ? await getShowsByGenre(genreId, 100)
        : await getMoviesByGenre(genreId, 100);
      return NextResponse.json({ items });
    }

    switch (section) {
      case 'featured':
        items = await getTrendingPaged(100);
        break;
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
      default:
        return NextResponse.json({ error: 'Unknown section' }, { status: 404 });
    }
    return NextResponse.json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
