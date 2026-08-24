import type { BatchRating } from '@/app/api/movies/ratings/route';

// Fetch what people THINK of titles — the Cinephilers aggregate — for a list of
// ids, in one request.
//
// The sibling of meta-batch, and split from it on purpose. Metadata is cached
// for an hour and served stale for a day because a poster does not change; a
// score changes every time somebody votes. Asking for them together would mean
// one of the two is always cached wrongly.
//
// Same coalescing idea: everything asked for in the same tick goes out together,
// so a list of twenty-five posters is one request rather than twenty-five.

const CHUNK = 100;

// Long enough that scrolling a list twice does not ask twice, short enough that
// a vote shows up while you are still looking at the app. The endpoint itself is
// CDN-cached for a minute, so this mostly saves the round trip.
const TTL_MS = 2 * 60 * 1000;

type Entry = { value: BatchRating | null; at: number };

// In memory, not localStorage. A stale score written to disk is the bug this
// whole change exists to fix — nothing about a vote count is worth surviving a
// reload.
const cache = new Map<string, Entry>();

let queue: string[] = [];
const inflight = new Map<string, Promise<BatchRating | null>>();
const resolvers = new Map<string, (r: BatchRating | null) => void>();
let flushScheduled = false;

function fresh(id: string): Entry | null {
  const hit = cache.get(id);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
    cache.delete(id);
    return null;
  }
  return hit;
}

async function flush() {
  flushScheduled = false;
  const ids = queue;
  queue = [];
  if (ids.length === 0) return;

  const settle = (id: string, value: BatchRating | null) => {
    cache.set(id, { value, at: Date.now() });
    resolvers.get(id)?.(value);
    resolvers.delete(id);
    inflight.delete(id);
  };

  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    try {
      const res = await fetch(`/api/movies/ratings?ids=${chunk.map(encodeURIComponent).join(',')}`);
      if (!res.ok) { for (const id of chunk) settle(id, null); continue; }
      const data: Record<string, BatchRating> = await res.json();
      for (const id of chunk) settle(id, data[id] ?? null);
    } catch {
      // Never leave a caller waiting on a promise that cannot resolve. A missing
      // community score is not an error the reader needs to hear about — the
      // TMDB rating is still there to fall back on.
      for (const id of chunk) settle(id, null);
    }
  }
}

function load(id: string): Promise<BatchRating | null> {
  const hit = fresh(id);
  if (hit) return Promise.resolve(hit.value);

  const existing = inflight.get(id);
  if (existing) return existing;

  const promise = new Promise<BatchRating | null>(resolve => resolvers.set(id, resolve));
  inflight.set(id, promise);
  queue.push(id);

  if (!flushScheduled) {
    flushScheduled = true;
    // Next tick, so everything the current render asks for lands in one batch.
    setTimeout(flush, 0);
  }
  return promise;
}

/** Community scores for many ids at once, keyed by the id you passed in. */
export async function batchFetchRatings(ids: string[]): Promise<Record<string, BatchRating | null>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const settled = await Promise.all(unique.map(id => load(id)));
  const out: Record<string, BatchRating | null> = {};
  unique.forEach((id, i) => { out[id] = settled[i]; });
  return out;
}

/** Drop everything — used when a vote lands so the next read reflects it. */
export function clearRatingCache() {
  cache.clear();
}
