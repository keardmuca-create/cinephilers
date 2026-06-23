import { Redis } from '@upstash/redis';
import type { Movie } from '@/lib/types';
import { WEEK_MS } from '@/lib/seed-shuffle';
import { isExcludedLanguage } from '@/lib/tmdb';

const redisUrl = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
const redis = redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null;

const BASE = 'https://api.themoviedb.org/3';
const IMG  = 'https://image.tmdb.org/t/p';
const DAY  = 86_400; // seconds

function toMovie(m: Record<string, unknown>, forceType?: 'movie' | 'show'): Movie {
  const isShow = forceType === 'show' || m.media_type === 'tv' || !!m.first_air_date;
  const id = isShow ? `tmdb-tv-${m.id}` : `tmdb-${m.id}`;
  const title = (m.title ?? m.name ?? 'Unknown') as string;
  const release = ((m.release_date ?? m.first_air_date ?? '') as string).slice(0, 4);
  const poster = m.poster_path ? `${IMG}/w342${m.poster_path}` : '';
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

export async function buildHomePool(): Promise<Movie[]> {
  const key = process.env.TMDB_API_KEY ?? '';
  if (!key) return [];

  const [mp1, mp2, sp1, sp2, mp3, sp3] = await Promise.all([
    fetchPage('/movie/popular', 1, key),
    fetchPage('/movie/popular', 2, key),
    fetchPage('/tv/popular',    1, key),
    fetchPage('/tv/popular',    2, key),
    fetchPage('/movie/popular', 3, key),
    fetchPage('/tv/popular',    3, key),
  ]);

  // Keep the home screen clean: drop zero/low-signal titles (a "Top 10" entry
  // with 0.0 and no votes looks broken) and excluded-language titles. The extra
  // page per type backfills the slots these filters remove. Search is unaffected.
  const keep = (m: Record<string, unknown>) =>
    Number(m.vote_count ?? 0) >= 50 &&
    Number(m.vote_average ?? 0) > 0 &&
    !!m.poster_path &&
    !isExcludedLanguage({ original_language: m.original_language as string | undefined });

  const movies: Movie[] = [...mp1, ...mp2, ...mp3].filter(keep).map(m => toMovie(m, 'movie'));
  const shows:  Movie[] = [...sp1, ...sp2, ...sp3].filter(keep).map(m => toMovie(m, 'show'));

  const seen = new Set<string>();
  const pool: Movie[] = [];
  for (const m of [...movies, ...shows]) {
    if (!seen.has(m.id)) { seen.add(m.id); pool.push(m); }
  }
  pool.sort((a, b) => a.id.localeCompare(b.id));
  return pool;
}

// Freeze the first pool built in a period in Redis so it survives deployments
// and cache evictions — otherwise the hero/featured/top-10 reshuffle mid-day.
async function frozenPool(key: string, ttlSeconds: number): Promise<Movie[]> {
  if (redis) {
    try {
      const cached = await redis.get<Movie[]>(key);
      if (Array.isArray(cached) && cached.length) return cached;
    } catch {}
  }

  const pool = await buildHomePool();

  if (redis && pool.length) {
    try {
      const set = await redis.set(key, pool, { ex: ttlSeconds, nx: true });
      if (set === null) {
        // Another request froze a pool first — use theirs so everyone matches
        const winner = await redis.get<Movie[]>(key);
        if (Array.isArray(winner) && winner.length) return winner;
      }
    } catch {}
  }
  return pool;
}

// Bump the version suffix whenever the pool's contents/filters change so stale
// frozen pools are abandoned and a fresh one is built immediately.
const POOL_VERSION = 'v2';

export async function getDailyPool(): Promise<Movie[]> {
  const day = new Date().toISOString().slice(0, 10);
  return frozenPool(`home-pool:${POOL_VERSION}:day:${day}`, 2 * 86_400);
}

export async function getWeeklyPool(): Promise<Movie[]> {
  const week = Math.floor(Date.now() / WEEK_MS);
  return frozenPool(`home-pool:${POOL_VERSION}:week:${week}`, 9 * 86_400);
}
