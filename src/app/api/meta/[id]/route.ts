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

  // Episode ID: tmdb-tv-{num}-S{season}E{episode}
  const epMatch = id.match(/^(tmdb-tv-(\d+))-S(\d+)E(\d+)$/);
  if (epMatch) {
    const showId = epMatch[1];
    const tvNum  = parseInt(epMatch[2], 10);
    const season = parseInt(epMatch[3], 10);
    const epNum  = parseInt(epMatch[4], 10);
    try {
      const [showRes, epRes] = await Promise.all([
        fetch(`${BASE}/tv/${tvNum}?api_key=${key}&language=en-US`, { next: { revalidate: 3600 } }),
        fetch(`${BASE}/tv/${tvNum}/season/${season}/episode/${epNum}?api_key=${key}&language=en-US`, { next: { revalidate: 3600 } }),
      ]);
      const showData = await showRes.json();
      const epData   = await epRes.json();
      const poster   = showData.poster_path
        ? `${IMG}/w342${showData.poster_path}`
        : '';
      const epTitle  = epData.name ?? `Episode ${epNum}`;
      const airDate  = epData.air_date ?? showData.first_air_date ?? '';
      const year     = airDate ? airDate.slice(0, 4) : '—';
      const meta: ItemMeta = {
        id, title: epTitle, year, poster,
        type: 'show', showId, isEpisode: true,
        showName: showData.name ?? undefined,
        seasonNumber: season,
        episodeNumber: epNum,
        tmdbRating: typeof epData.vote_average === 'number' ? epData.vote_average : undefined,
      };
      return NextResponse.json(meta);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

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
      : '';

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
      language: d.original_language ?? undefined,
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
