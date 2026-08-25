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

// ── Staying current ─────────────────────────────────────────────────────────
//
// Everything above assumes a page that eventually gets read again: the cache
// expires after two minutes and the next mount asks for a fresh number. In a
// browser tab that holds, because navigating anywhere remounts the lists.
//
// Installed as a PWA it does not. The home screen mounts once and stays mounted
// for days, so the request that fills these scores happens exactly once, and the
// number under a poster is frozen at whatever it was when the app was opened —
// including after you have voted on it yourself. The film page looked right
// because it refreshes its own score on the vote event; the row behind it never
// heard about any of it.
//
// So the cache announces itself. Two things invalidate it, and both notify every
// mounted list:
//
//   1. A vote that the SERVER has confirmed. Not the optimistic local write —
//      the aggregate is recomputed server-side, so asking before the POST lands
//      returns the old number and caches it for another two minutes.
//   2. The app coming back to the foreground, throttled. This is the PWA case:
//      whatever changed while it was in your pocket is picked up on the way in.
type Listener = () => void;
const listeners = new Set<Listener>();

// Set when the cache is dropped for a reason, and consumed by the next flush as
// a cache-busting query param. The endpoint is CDN-cached for a minute
// (s-maxage=60), so a refetch immediately after a vote would be served the very
// number the vote changed. One param per invalidation, not per request — the
// CDN copy is worth having the rest of the time.
let bust = 0;

const RESUME_THROTTLE_MS = 60_000;
let lastInvalidated = 0;

function invalidate() {
  cache.clear();
  bust = Date.now();
  lastInvalidated = Date.now();
  for (const l of listeners) l();
}

/**
 * Called when a list wants to know that the scores it is showing have gone
 * stale. Returns the unsubscribe.
 */
export function subscribeRatingCache(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

if (typeof window !== 'undefined') {
  // Dispatched by the film page once the server has accepted the vote.
  window.addEventListener('cinephilers-rating-synced', invalidate);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (Date.now() - lastInvalidated < RESUME_THROTTLE_MS) return;
    invalidate();
  });
}

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

  // Consumed here, so only the first request after an invalidation skips the
  // CDN. Every later one is allowed the shared copy again.
  const nonce = bust;
  bust = 0;

  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    try {
      const res = await fetch(
        `/api/movies/ratings?ids=${chunk.map(encodeURIComponent).join(',')}${nonce ? `&_=${nonce}` : ''}`
      );
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

/**
 * Drop everything and tell every mounted list to ask again.
 *
 * This existed before with only the first half and no callers at all, which is
 * precisely why the scores froze: the mechanism for reacting to a vote was
 * written and never wired to anything.
 */
export function clearRatingCache() {
  invalidate();
}
