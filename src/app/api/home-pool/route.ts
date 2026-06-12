import { NextResponse } from 'next/server';
import { getDailyPool, getWeeklyPool } from '@/lib/home-pool';

export async function GET() {
  const [daily, weekly] = await Promise.all([getDailyPool(), getWeeklyPool()]);
  if (!daily.length) return NextResponse.json({ error: 'No API key or fetch failed' }, { status: 500 });

  return NextResponse.json({ daily, weekly }, {
    headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=600' },
  });
}
