import { NextRequest, NextResponse } from 'next/server';
import { getMoviesByGenre, getShowsByGenre } from '@/lib/tmdb';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const idParam = searchParams.get('id');
  const type = searchParams.get('type') === 'tv' ? 'tv' : 'movie';
  const count = Math.min(Math.max(parseInt(searchParams.get('count') ?? '25', 10), 1), 100);

  const genreId = parseInt(idParam ?? '', 10);
  if (!idParam || isNaN(genreId)) {
    return NextResponse.json({ error: 'Missing or invalid genre id' }, { status: 400 });
  }

  try {
    const items =
      type === 'tv'
        ? await getShowsByGenre(genreId, count)
        : await getMoviesByGenre(genreId, count);
    return NextResponse.json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
