import { NextResponse } from 'next/server';
import { Movie } from '@/lib/types';

const BASE = 'https://api.themoviedb.org/3';
const IMG  = 'https://image.tmdb.org/t/p';
const DAY  = 86_400; // seconds

function toMovie(m: Record<string, unknown>, forceType?: 'movie' | 'show'): Movie {
  const isShow = forceType === 'show' || m.media_type === 'tv' || !!m.first_air_date;
  const id = isShow ? `tmdb-tv-${m.id}` : `tmdb-${m.id}`;
  const title = (m.title ?? m.name ?? 'Unknown') as string;
  const release = ((m.release_date ?? m.first_air_date ?? '') as string).slice(0, 4);
  const poster = m.poster_path ? `${IMG}/w342${m.poster_path}` : `https://picsum.photos/seed/${id}/400/600`;
  const backdrop = m.backdrop_path ? `${IMG}/w1280${m.backdrop_path}` : poster;
  return {
    id, title, year: release || '—', poster, backdrop,
    rating: Number(m.vote_average ?? 0),
    followingsRating: parseFloat(Number(m.vote_average ?? 0).toFixed(1)),
    votes: Number(m.vote_count ?? 0),
    genre: '', description: '', director: '',
    cast: [], reviews: [], quotes: [], trivia: [],
    type: isShow ? 'show' : 'movie',
  };
}

async function fetchPage(path: string, page: number, key: string): Promise<Record<string, unknown>[]> {
  const url = `${BASE}${path}?api_key=${key}&language=en-US&page=${page}`;
  const res = await fetch(url, { next: { revalidate: DAY } });
  if (!res.ok) return [];
  const d = await res.json() as { results?: Record<string, unknown>[] };
  return d.results ?? [];
}

export async function GET() {
  const key = process.env.TMDB_API_KEY ?? '';
  if (!key) return NextResponse.json({ error: 'No API key' }, { status: 500 });

  // Fetch 2 pages each (~40 movies, ~40 shows) with a 24-hour server cache
  const [mp1, mp2, sp1, sp2] = await Promise.all([
    fetchPage('/movie/popular', 1, key),
    fetchPage('/movie/popular', 2, key),
    fetchPage('/tv/popular',    1, key),
    fetchPage('/tv/popular',    2, key),
  ]);

  const movies: Movie[] = [...mp1, ...mp2].map(m => toMovie(m, 'movie'));
  const shows:  Movie[] = [...sp1, ...sp2].map(m => toMovie(m, 'show'));

  // Deduplicate and sort by ID — stable order for every device
  const seen = new Set<string>();
  const pool: Movie[] = [];
  for (const m of [...movies, ...shows]) {
    if (!seen.has(m.id)) { seen.add(m.id); pool.push(m); }
  }
  pool.sort((a, b) => a.id.localeCompare(b.id));

  return NextResponse.json(pool, {
    headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600' },
  });
}
