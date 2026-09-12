import { NextRequest } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';
import { rateLimit } from '@/lib/rate-limit';
import {
  matchByImdbId, matchByTitle, titleKey, createThrottle, mapWithConcurrency, defaultFetcher,
  type TitleMatch, type TmdbFetcher,
} from '@/lib/tmdb-match';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Matches an import file's titles to TMDB, fifty at a time.
//
// The dialog used to send one browser request per title, five at a time, paced to
// 480 a minute to stay under the search route's limit — about 21 minutes for a
// 10,000-title library. Here the server does a batch at once, and three things make
// it faster without leaning on TMDB any harder than it allows:
//
// 1. IMDb rows carry their IMDb id, and TMDB resolves one exactly in a single
//    request — no fuzzy title search, no "It (2017)" matched to "It starts today".
// 2. Lookups run ten at a time, with every TMDB call spaced under a per-request
//    rate cap, so a big import can't crowd out title pages that load from TMDB too.
// 3. A shared memory of SURE matches (ImportMatch) answers titles someone has
//    already imported without calling TMDB at all. Guesses are never remembered,
//    or one wrong guess would spread to every import after it.
//
// The memory is a speed-up, never a dependency: if its table is unreachable, every
// title is simply looked up.

const MAX_ITEMS = 50;
const LOOKUP_CONCURRENCY = 10;
// TMDB asks for no more than ~50 requests a second. This leaves room for everything
// else the site fetches from TMDB at the same moment.
const TMDB_PER_SECOND = 35;

interface MatchItem {
  key: string;
  title: string;
  year?: string;
  imdbId?: string;
  typeHint?: 'movie' | 'tv';
}

interface MatchResult {
  key: string;
  match: TitleMatch | null;
  /** TMDB couldn't be reached for this one — ask again rather than call it unmatched. */
  retry?: boolean;
}

function readItems(raw: unknown): MatchItem[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_ITEMS) return null;
  const items: MatchItem[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    if (!r || typeof r.key !== 'string' || r.key.length > 100) return null;
    if (typeof r.title !== 'string' || !r.title.trim() || r.title.length > 300) return null;
    items.push({
      key: r.key,
      title: r.title.trim(),
      year: typeof r.year === 'string' && /^\d{4}$/.test(r.year) ? r.year : undefined,
      imdbId: typeof r.imdbId === 'string' && /^tt\d{5,10}$/.test(r.imdbId) ? r.imdbId : undefined,
      typeHint: r.typeHint === 'movie' || r.typeHint === 'tv' ? r.typeHint : undefined,
    });
  }
  return items;
}

export async function POST(req: NextRequest) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  // 400 batches per 10 minutes is 20,000 titles — room for the biggest library and
  // its retries, and still a ceiling on anyone using this as a free TMDB proxy.
  const { allowed, retryAfter } = await rateLimit(`import-match:${auth.sub}`, 400, 600_000);
  if (!allowed) return err(`Too many requests. Try again in ${retryAfter}s`, 429);

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return err('TMDB key not configured', 500);

  const body = await req.json().catch(() => null);
  const items = readItems(body?.items);
  if (!items) return err(`Send 1–${MAX_ITEMS} titles`, 400);

  // IMDb rows are remembered by their id; everything else by title, year and type.
  const memoryKey = (it: MatchItem) => (it.imdbId ? `imdb:${it.imdbId}` : titleKey(it.title, it.year, it.typeHint));

  const remembered = new Map<string, TitleMatch>();
  try {
    const rows = await prisma.importMatch.findMany({ where: { key: { in: [...new Set(items.map(memoryKey))] } } });
    for (const r of rows) {
      remembered.set(r.key, {
        tmdbId: r.tmdbId, mediaType: r.mediaType, title: r.title, year: r.year ?? '',
        poster: r.poster, language: r.language ?? '', rating: r.rating ?? undefined, confident: true,
      });
    }
  } catch (e) {
    Sentry.captureException(e);
  }

  const throttle = createThrottle(TMDB_PER_SECOND);
  const fetcher: TmdbFetcher = async url => { await throttle(); return defaultFetcher(url); };

  const toRemember = new Map<string, { key: string; tmdbId: string; mediaType: 'MOVIE' | 'SHOW'; title: string; year: string | null; poster: string | null; language: string | null; rating: number | null; source: string }>();
  const remember = (keys: string[], m: TitleMatch, source: string) => {
    for (const key of keys) {
      toRemember.set(key, {
        key, tmdbId: m.tmdbId, mediaType: m.mediaType, title: m.title, year: m.year || null,
        poster: m.poster, language: m.language || null, rating: m.rating ?? null, source,
      });
    }
  };

  let fromMemory = 0;
  const results = await mapWithConcurrency(items, LOOKUP_CONCURRENCY, async (it): Promise<MatchResult> => {
    const hit = remembered.get(memoryKey(it));
    if (hit) { fromMemory++; return { key: it.key, match: hit }; }

    try {
      if (it.imdbId) {
        const exact = await matchByImdbId(it.imdbId, apiKey, fetcher);
        if (exact) {
          // The id, and the file's own title and year too: the next person importing
          // this film from Letterboxd, which has no ids, gets the exact answer.
          const kind = exact.mediaType === 'SHOW' ? 'tv' : 'movie';
          remember([`imdb:${it.imdbId}`, titleKey(it.title, it.year, null), titleKey(it.title, it.year, kind)], exact, 'imdb-id');
          return { key: it.key, match: exact };
        }
        // TMDB has nothing under that id. A title search may still find it, but
        // only as a suggestion the person confirms — and it is not remembered.
        const guess = await matchByTitle(it.title, it.year ?? null, it.typeHint ?? null, apiKey, fetcher);
        return { key: it.key, match: guess ? { ...guess, confident: false } : null };
      }

      const m = await matchByTitle(it.title, it.year ?? null, it.typeHint ?? null, apiKey, fetcher);
      if (m?.confident) remember([memoryKey(it)], m, 'search');
      return { key: it.key, match: m };
    } catch {
      return { key: it.key, match: null, retry: true };
    }
  });

  if (toRemember.size > 0) {
    try {
      await prisma.importMatch.createMany({ data: [...toRemember.values()], skipDuplicates: true });
    } catch (e) {
      Sentry.captureException(e);
    }
  }

  return ok({ results, fromMemory });
}
