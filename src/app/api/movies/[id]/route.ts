
import { NextRequest, NextResponse } from 'next/server';
import { getMovieDetail, getShowDetail } from '@/lib/tmdb';
import { rateLimit, getIp } from '@/lib/rate-limit';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Own bucket, deliberately NOT the shared tmdb: one. Opening a title page is
  // the app's most critical read — browse/search/discover storms must never be
  // able to starve it into the "Title not found" screen.
  const { allowed } = await rateLimit(`movie-detail:${getIp(req)}`, 300, 60_000);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const { id: raw } = await params;
  const isShow = raw.startsWith('tmdb-tv-');
  const numId = parseInt(raw.replace('tmdb-tv-', '').replace('tmdb-', ''), 10);

  if (isNaN(numId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  try {
    const movie = isShow ? await getShowDetail(numId) : await getMovieDetail(numId);
    // Same response for every viewer — let Vercel's CDN serve repeats for an
    // hour without invoking the function (each invocation parses a large TMDB
    // payload and bills active CPU).
    return NextResponse.json(movie, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=600' },
    });
  } catch (err) {
    console.error('movie detail error:', err);
    return NextResponse.json({ error: 'Failed to load title' }, { status: 500 });
  }
}
