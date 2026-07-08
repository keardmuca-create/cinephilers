
import { NextRequest, NextResponse } from 'next/server';
import { searchTmdb } from '@/lib/tmdb';
import { rateLimit, getIp } from '@/lib/rate-limit';

export async function GET(req: NextRequest) {
  const { allowed } = await rateLimit(`tmdb:${getIp(req)}`, 300, 60_000);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const query = req.nextUrl.searchParams.get('q') ?? '';
  if (!query.trim()) {
    return NextResponse.json({ results: [] });
  }
  try {
    const { results, people, combined } = await searchTmdb(query);
    // Cached per query string — popular searches ("dune", "batman") stop
    // invoking the function on every keystroke of every user.
    return NextResponse.json({ results, people, combined }, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=600' },
    });
  } catch (err) {
    console.error('search error:', err);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
