import { NextRequest, NextResponse } from 'next/server';
import { getDailyPool, getWeeklyPool } from '@/lib/home-pool';
import { rateLimit, getIp } from '@/lib/rate-limit';

export async function GET(req: NextRequest) {
  const { allowed } = await rateLimit(`tmdb:${getIp(req)}`, 120, 60_000);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const [daily, weekly] = await Promise.all([getDailyPool(), getWeeklyPool()]);
  if (!daily.length) return NextResponse.json({ error: 'No API key or fetch failed' }, { status: 500 });

  return NextResponse.json({ daily, weekly }, {
    headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=600' },
  });
}
