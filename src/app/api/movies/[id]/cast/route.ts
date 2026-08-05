import { NextRequest, NextResponse } from 'next/server';
import { getFullCast } from '@/lib/tmdb';
import { rateLimit, getIp } from '@/lib/rate-limit';

// The complete cast, kept out of the title payload. A series can credit hundreds
// of actors and the title page draws twenty of them, so the full list is fetched
// only by the Cast & Crew screen that actually shows it.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { allowed } = await rateLimit(`cast:${getIp(req)}`, 300, 60_000);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const { id: raw } = await params;
  const isShow = raw.startsWith('tmdb-tv-');
  const numId = parseInt(raw.replace('tmdb-tv-', '').replace('tmdb-', ''), 10);
  if (isNaN(numId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  try {
    const cast = await getFullCast(numId, isShow);
    // Same for every viewer and changes about as often as a film's cast does.
    return NextResponse.json(cast, {
      headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600' },
    });
  } catch (err) {
    console.error('cast error:', err);
    return NextResponse.json({ error: 'Failed to load cast' }, { status: 500 });
  }
}
