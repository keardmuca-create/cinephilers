import { NextRequest, NextResponse } from 'next/server';
import { getEpisodeDetail } from '@/lib/tmdb';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; num: string; ep: string }> },
) {
  const { id, num, ep } = await params;
  const showId = parseInt(id, 10);
  const seasonNum = parseInt(num, 10);
  const episodeNum = parseInt(ep, 10);

  if (isNaN(showId) || isNaN(seasonNum) || isNaN(episodeNum)) {
    return NextResponse.json({ error: 'Invalid params' }, { status: 400 });
  }

  try {
    const detail = await getEpisodeDetail(showId, seasonNum, episodeNum);
    return NextResponse.json(detail);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
