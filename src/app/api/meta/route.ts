import { NextRequest, NextResponse } from 'next/server';
import { fetchOneMeta } from './_fetch';
import { rateLimit, getIp } from '@/lib/rate-limit';
import type { ItemMeta } from './[id]/route';

const MAX_IDS = 100;

export async function GET(req: NextRequest) {
  // Own bucket, tighter than the shared tmdb one: a single call here fans out
  // up to MAX_IDS TMDB fetches, so 30/min still allows several full library
  // loads while capping what one IP can make us fetch.
  const { allowed } = await rateLimit(`meta:${getIp(req)}`, 30, 60_000);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const key = process.env.TMDB_API_KEY ?? '';
  if (!key) return NextResponse.json({ error: 'No API key' }, { status: 500 });

  const idsParam = req.nextUrl.searchParams.get('ids') ?? '';
  const ids = idsParam.split(',').map(s => s.trim()).filter(Boolean).slice(0, MAX_IDS);
  if (ids.length === 0) return NextResponse.json({});

  const results = await Promise.allSettled(ids.map(id => fetchOneMeta(id, key)));
  const out: Record<string, ItemMeta | null> = {};
  ids.forEach((id, i) => {
    const r = results[i];
    out[id] = r.status === 'fulfilled' ? r.value : null;
  });
  // Title metadata barely changes — cache per ids-combination for an hour and
  // serve stale for a day while revalidating in the background.
  return NextResponse.json(out, {
    headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
  });
}
