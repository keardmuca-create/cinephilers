import { NextRequest, NextResponse } from 'next/server';
import { fetchOneMeta } from '../_fetch';
import { rateLimit, getIp } from '@/lib/rate-limit';

export interface ItemMeta {
  id: string;
  title: string;
  year: string;
  releaseDate?: string;  // full ISO date (e.g. "2026-12-18"); '' when TMDB has none
  poster: string;
  type: 'movie' | 'show';
  genre?: string;
  runtime?: number;  // minutes — movies only; used to classify shorts (<=40 min)
  language?: string;
  showType?: string;
  tmdbStatus?: string;
  totalEps?: number;
  tmdbRating?: number;
  showId?: string;  // set for episode entries — use to link back to the show page
  isEpisode?: boolean;
  showName?: string;       // episode entries: the parent show's name
  seasonNumber?: number;   // episode entries
  episodeNumber?: number;  // episode entries
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Own bucket, NOT the shared tmdb: one — the social feed fires one of these
  // per activity item on a cold cache, and sharing a bucket with movies/[id]
  // and search let a busy feed starve the movie page into "Title not found".
  // 300/min still caps abuse (each call = at most one uncached TMDB fetch).
  const { allowed } = await rateLimit(`meta-one:${getIp(req)}`, 300, 60_000);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const { id } = await params;
  const key = process.env.TMDB_API_KEY ?? '';
  if (!key) return NextResponse.json({ error: 'No API key' }, { status: 500 });

  try {
    const meta = await fetchOneMeta(id, key);
    return NextResponse.json(meta, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const status = msg === 'Invalid id' ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
