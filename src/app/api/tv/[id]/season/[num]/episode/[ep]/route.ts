import { NextRequest, NextResponse } from 'next/server';
import { getEpisodeDetail } from '@/lib/tmdb';
import { rateLimit, getIp } from '@/lib/rate-limit';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; num: string; ep: string }> },
) {
  const { allowed } = await rateLimit(`tmdb:${getIp(req)}`, 120, 60_000);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const { id, num, ep } = await params;
  const showId = parseInt(id, 10);
  const seasonNum = parseInt(num, 10);
  const episodeNum = parseInt(ep, 10);

  if (isNaN(showId) || isNaN(seasonNum) || isNaN(episodeNum)) {
    return NextResponse.json({ error: 'Invalid params' }, { status: 400 });
  }

  try {
    const detail = await getEpisodeDetail(showId, seasonNum, episodeNum);
    return NextResponse.json(detail, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=600' },
    });
  } catch (err) {
    console.error('episode error:', err);
    return NextResponse.json({ error: 'Failed to load episode' }, { status: 500 });
  }
}
