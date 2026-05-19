import { NextRequest, NextResponse } from 'next/server';

const BASE = 'https://api.themoviedb.org/3';
const IMG  = 'https://image.tmdb.org/t/p';

export interface ItemMeta {
  id: string;
  title: string;
  year: string;
  poster: string;
  type: 'movie' | 'show';
  genre?: string;
  showType?: string;
  tmdbStatus?: string;
  totalEps?: number;
  tmdbRating?: number;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const key = process.env.TMDB_API_KEY ?? '';
  if (!key) return NextResponse.json({ error: 'No API key' }, { status: 500 });

  const isShow = id.startsWith('tmdb-tv-');
  const numStr = isShow ? id.replace('tmdb-tv-', '') : id.replace('tmdb-', '');
  const num = parseInt(numStr, 10);
  if (isNaN(num)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  try {
    const path = isShow ? `/tv/${num}` : `/movie/${num}`;
    const url = `${BASE}${path}?api_key=${key}&language=en-US`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) throw new Error(`TMDB ${res.status}`);
    const d = await res.json();

    const poster = d.poster_path
      ? `${IMG}/w342${d.poster_path}`
      : `https://picsum.photos/seed/${id}/400/600`;

    const title = d.title ?? d.name ?? 'Untitled';
    const release = d.release_date ?? d.first_air_date ?? '';
    const year = release ? release.slice(0, 4) : '—';

    // genre string for movies (used to detect TV Movie)
    const genreNames: string[] = (d.genres ?? []).map((g: { name: string }) => g.name);
    const genre = genreNames.join(', ') || undefined;

    const meta: ItemMeta = {
      id,
      title,
      year,
      poster,
      type: isShow ? 'show' : 'movie',
      genre,
      showType: isShow ? (d.type ?? undefined) : undefined,
      tmdbStatus: d.status ?? undefined,
      totalEps: isShow ? (d.number_of_episodes ?? undefined) : undefined,
      tmdbRating: typeof d.vote_average === 'number' ? d.vote_average : undefined,
    };

    return NextResponse.json(meta);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
