
import { NextRequest, NextResponse } from 'next/server';
import { getMovieById, getShowById } from '@/lib/tmdb';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: raw } = await params;
  const isShow = raw.startsWith('tmdb-tv-');
  const numId = parseInt(raw.replace('tmdb-tv-', '').replace('tmdb-', ''), 10);

  if (isNaN(numId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  try {
    const movie = isShow ? await getShowById(numId) : await getMovieById(numId);
    return NextResponse.json(movie);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
