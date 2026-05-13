import { NextRequest, NextResponse } from 'next/server';
import { getTvSeasonEpisodes } from '@/lib/tmdb';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; num: string }> }
) {
  const { id, num } = await params;
  const showId = parseInt(id, 10);
  const seasonNum = parseInt(num, 10);

  if (isNaN(showId) || isNaN(seasonNum)) {
    return NextResponse.json({ error: 'Invalid params' }, { status: 400 });
  }

  try {
    const episodes = await getTvSeasonEpisodes(showId, seasonNum);
    return NextResponse.json({ episodes });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
