import { NextRequest, NextResponse } from 'next/server';
import { getWatchProviders } from '@/lib/tmdb';
import { rateLimit, getIp } from '@/lib/rate-limit';

// Deliberately its own route rather than another append_to_response on the title
// payload. That response is cached by the CDN and served to every viewer alike —
// folding in availability, which differs by country, would hand one country's
// answer to everybody. Region is a query parameter so it forms part of the cache
// key, which keeps the answer right AND still cacheable, one entry per region.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { allowed } = await rateLimit(`providers:${getIp(req)}`, 300, 60_000);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const { id: raw } = await params;
  const isShow = raw.startsWith('tmdb-tv-');
  const numId = parseInt(raw.replace('tmdb-tv-', '').replace('tmdb-', ''), 10);
  if (isNaN(numId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  // Two letters only — this reaches TMDB, so it is checked rather than trusted.
  const rawRegion = req.nextUrl.searchParams.get('region') ?? 'US';
  const region = /^[A-Za-z]{2}$/.test(rawRegion) ? rawRegion.toUpperCase() : 'US';

  const providers = await getWatchProviders(numId, isShow, region);

  // Cached a day: a title's availability moves on the scale of weeks, and a stale
  // logo costs far less than a TMDB call on every page view.
  return NextResponse.json(providers, {
    headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600' },
  });
}
