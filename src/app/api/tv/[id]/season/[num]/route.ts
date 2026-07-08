import { NextRequest, NextResponse } from 'next/server';
import { getTvSeasonEpisodes } from '@/lib/tmdb';
import { rateLimit, getIp } from '@/lib/rate-limit';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; num: string }> }
) {
  const { allowed } = await rateLimit(`tmdb:${getIp(req)}`, 300, 60_000);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const { id, num } = await params;
  const showId = parseInt(id, 10);
  const seasonNum = parseInt(num, 10);

  if (isNaN(showId) || isNaN(seasonNum)) {
    return NextResponse.json({ error: 'Invalid params' }, { status: 400 });
  }

  try {
    const episodes = await getTvSeasonEpisodes(showId, seasonNum);
    return NextResponse.json({ episodes }, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=600' },
    });
  } catch (err) {
    console.error('season error:', err);
    return NextResponse.json({ error: 'Failed to load season' }, { status: 500 });
  }
}
