import { NextRequest } from 'next/server';
import { ok, err } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

const BASE = 'https://api.themoviedb.org/3';

export async function GET(req: NextRequest) {
  const key = process.env.TMDB_API_KEY;
  if (!key) return err('TMDB key not configured', 500);

  const q = req.nextUrl.searchParams.get('q')?.trim();
  const year = req.nextUrl.searchParams.get('year')?.trim();
  if (!q) return err('Missing query');

  const url = `${BASE}/search/multi?api_key=${key}&query=${encodeURIComponent(q)}${year ? `&year=${year}` : ''}&include_adult=false`;

  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return err('TMDB error', 502);
    const data = await res.json();

    const results = (data.results ?? []) as {
      id: number;
      media_type: string;
      title?: string;
      name?: string;
      release_date?: string;
      first_air_date?: string;
      poster_path?: string;
    }[];

    // Filter to movies and TV only (skip people)
    const filtered = results.filter(r => r.media_type === 'movie' || r.media_type === 'tv');
    if (filtered.length === 0) return ok(null);

    const top = filtered[0];
    const tmdbId = top.media_type === 'tv' ? `tmdb-tv-${top.id}` : String(top.id);
    const mediaType = top.media_type === 'tv' ? 'SHOW' : 'MOVIE';
    const title = top.title ?? top.name ?? q;
    const releaseYear = (top.release_date ?? top.first_air_date ?? '').slice(0, 4);
    const poster = top.poster_path ? `https://image.tmdb.org/t/p/w200${top.poster_path}` : null;

    return ok({ tmdbId, mediaType, title, year: releaseYear, poster });
  } catch {
    return err('Search failed', 502);
  }
}
