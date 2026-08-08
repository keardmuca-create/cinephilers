import { Redis } from '@upstash/redis';
import type { Movie } from '@/lib/types';
import { WEEK_MS } from '@/lib/seed-shuffle';
import { passesDiscoveryFilters } from '@/lib/tmdb';

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
  // include_adult=false to match every other discovery call in lib/tmdb — this
  // one was the only list asking TMDB without it. It is not the whole answer on
  // its own (TMDB does not flag every adult title, which is what the vote floor
  // is really for), but the inconsistency was a bug.
  const url = `${BASE}${path}?api_key=${key}&language=en-US&include_adult=false&page=${page}`;
  const res = await fetch(url, { next: { revalidate: DAY } });
  if (!res.ok) return [];
  const d = await res.json() as { results?: Record<string, unknown>[] };
  return d.results ?? [];
}

export async function buildHomePool(): Promise<Movie[]> {
  const key = process.env.TMDB_API_KEY ?? '';
  if (!key) return [];

  // Five pages per type, up from three. The 500-vote floor removes roughly a
  // fifth of what TMDB returns, and the pool has to stay comfortably bigger than
  // what the home screen draws from it — Featured alone takes fifteen. Each page
  // is cached for a day, so this is ten fetches once, not per visitor.
  const PAGES = [1, 2, 3, 4, 5];
  const [moviePages, showPages] = await Promise.all([
    Promise.all(PAGES.map(p => fetchPage('/movie/popular', p, key))),
    Promise.all(PAGES.map(p => fetchPage('/tv/popular', p, key))),
  ]);

  // This pool builds its own list straight from TMDB rather than going through
  // lib/tmdb's list helpers, so it does NOT inherit their filters. It used to
  // carry its own copy of the rules, and that copy fell behind — which is how The
  // Late Show was still reaching Featured Today after talk shows had been
  // filtered everywhere else. It now calls the shared gate, so the vote floor and
  // the genre and language rules can only ever be changed in one place.
  //
  // Search is unaffected and must stay that way: anything held back from here is
  // still findable by name.
  const keep = (m: Record<string, unknown>) =>
    passesDiscoveryFilters({
      vote_count: Number(m.vote_count ?? 0),
      vote_average: Number(m.vote_average ?? 0),
      poster_path: m.poster_path as string | null | undefined,
      original_language: m.original_language as string | undefined,
      genre_ids: m.genre_ids as number[] | undefined,
    });

  const movies: Movie[] = moviePages.flat().filter(keep).map(m => toMovie(m, 'movie'));
  const shows:  Movie[] = showPages.flat().filter(keep).map(m => toMovie(m, 'show'));

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
const POOL_VERSION = 'v4';   // v4: shared discovery gate — 500-vote floor, daily TV out, include_adult

export async function getDailyPool(): Promise<Movie[]> {
  const day = new Date().toISOString().slice(0, 10);
  return frozenPool(`home-pool:${POOL_VERSION}:day:${day}`, 2 * 86_400);
}

export async function getWeeklyPool(): Promise<Movie[]> {
  const week = Math.floor(Date.now() / WEEK_MS);
  return frozenPool(`home-pool:${POOL_VERSION}:week:${week}`, 9 * 86_400);
}
