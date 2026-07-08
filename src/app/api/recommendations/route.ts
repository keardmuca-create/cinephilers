import { NextRequest, NextResponse } from 'next/server';
import { getRecommendations } from '@/lib/recommendations';
import { rateLimit, getIp } from '@/lib/rate-limit';

export async function GET(req: NextRequest) {
  const { allowed } = await rateLimit(`tmdb:${getIp(req)}`, 300, 60_000);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const recs = await getRecommendations(req, 20);
  return NextResponse.json(recs);
}
