import { NextRequest, NextResponse } from 'next/server';
import { fetchOneMeta } from '../_fetch';

export interface ItemMeta {
  id: string;
  title: string;
  year: string;
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
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const key = process.env.TMDB_API_KEY ?? '';
  if (!key) return NextResponse.json({ error: 'No API key' }, { status: 500 });

  try {
    const meta = await fetchOneMeta(id, key);
    return NextResponse.json(meta);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const status = msg === 'Invalid id' ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
