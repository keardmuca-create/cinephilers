import { NextRequest, NextResponse } from 'next/server';
import { getRecommendations } from '@/lib/recommendations';

export async function GET(req: NextRequest) {
  const recs = await getRecommendations(req, 20);
  return NextResponse.json(recs);
}
