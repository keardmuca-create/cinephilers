import { NextResponse } from 'next/server';
import { buildHomePool } from '@/lib/home-pool';

export async function GET() {
  const pool = await buildHomePool();
  if (!pool.length) return NextResponse.json({ error: 'No API key or fetch failed' }, { status: 500 });

  return NextResponse.json(pool, {
    headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600' },
  });
}
