
import { NextRequest, NextResponse } from 'next/server';
import { getPersonCredits } from '@/lib/tmdb';
import { rateLimit, getIp } from '@/lib/rate-limit';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { allowed } = await rateLimit(`tmdb:${getIp(req)}`, 120, 60_000);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const { id } = await params;
  const numId = parseInt(id, 10);
  if (isNaN(numId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  try {
    const data = await getPersonCredits(numId);
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=600' },
    });
  } catch (err) {
    console.error('person error:', err);
    return NextResponse.json({ error: 'Failed to load person' }, { status: 500 });
  }
}
