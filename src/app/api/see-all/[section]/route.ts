
import { NextRequest, NextResponse } from 'next/server';
import {
  getPopularMoviesPaged,
  getPopularShowsEnriched,
  getTrendingPaged,
} from '@/lib/tmdb';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ section: string }> },
) {
  const { section } = await params;

  try {
    let items;
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
      default:
        return NextResponse.json({ error: 'Unknown section' }, { status: 404 });
    }
    return NextResponse.json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
