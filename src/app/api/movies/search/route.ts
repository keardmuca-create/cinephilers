
import { NextRequest, NextResponse } from 'next/server';
import { searchTmdb } from '@/lib/tmdb';

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('q') ?? '';
  if (!query.trim()) {
    return NextResponse.json({ results: [] });
  }
  try {
    const { results, people, combined } = await searchTmdb(query);
    return NextResponse.json({ results, people, combined });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
