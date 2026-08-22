import type { ItemMeta } from '@/app/api/meta/[id]/route';

// Fetch what titles ARE — poster, year, genre, runtime — for a list of ids.
//
// Callers don't coordinate: the profile alone asks from five places at once
// (watch history, watchlist, reviews, ratings, rewatched), and each used to make
// its own request. Five round trips landing at five different moments is why
// sections appeared one at a time, in whatever order the network happened to
// answer, and why the same id could be fetched twice over.
//
// So requests made in the same tick are gathered into one call. Every caller
// waits on the same flush and gets its answer at the same moment as the others —
// which is both fewer requests and, from the outside, everything at once.

const CHUNK = 100;

// How long a cached show is trusted before it is fetched again.
//
// A film is finished the day it comes out; a show is not. Episodes keep landing,
// so its total moves — and the total is what "45 / 62" and every eye, filled or
// hollow, are measured against. This cache had no expiry at all, so a device that
// had seen a show once kept whatever total it saw then, for good: a new episode
// aired, the server knew within the hour, and that phone still said 63 / 63 with a
// filled eye. A day is short enough that a new episode surfaces the same week it
// airs, and long enough that nobody refetches a show twice in one sitting.
//
// Films are deliberately left alone — nothing about them moves, and expiring them
// would refetch a whole library for no gain.
//
// Episodes are left alone too, and that one is worth explaining. An episode entry
// carries its parent's total, so expiring episodes would work — but a library holds
// hundreds of episodes and only a few dozen shows, and checking one episode costs
// the server TWO TMDB fetches, because it has to look up the show anyway. That is
// the same handful of shows re-checked once per episode of them. The show's own
// entry is the authority on its own total, so only shows expire, and collapseShows
// prefers the show's number over the one its episodes are carrying.
const SHOW_TTL_MS = 24 * 60 * 60 * 1000;

/** A cache entry plus when we wrote it. The stamp is ours, not TMDB's. */
export type CachedMeta = ItemMeta & { _fetchedAt?: number };

/**
 * True when a cached entry is old enough that its episode total may have moved.
 *
 * Exported because this cache has more readers than this module: the history page
 * and the profile read localStorage straight and decide for themselves what to
 * refetch. They have to agree on what stale means, or one keeps handing the old
 * total back to the others.
 *
 * An entry with no stamp — written before stamping existed, or by a page that
 * writes the cache directly — counts as stale once, and carries a stamp after.
 */
export function isStaleMeta(cached: CachedMeta | null | undefined): boolean {
  if (!cached || cached.type !== 'show' || cached.isEpisode === true) return false;
  const stamp = typeof cached._fetchedAt === 'number' ? cached._fetchedAt : 0;
  return Date.now() - stamp > SHOW_TTL_MS;
}

// Ids waiting for the next flush, and the promise each caller is holding. The
// promise map is what stops two callers asking for the same id twice.
let queue: string[] = [];
const inflight = new Map<string, Promise<ItemMeta | null>>();
const resolvers = new Map<string, (m: ItemMeta | null) => void>();
let flushScheduled = false;

function readCache(id: string, needReleaseDate?: boolean): ItemMeta | null {
  try {
    const raw = localStorage.getItem(`meta-${id}`);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedMeta;
    // Shows and their episodes go stale; films never do.
    if (isStaleMeta(cached)) return null;
    // Refetch entries cached before runtime/showType tracking so movie shorts
    // (by runtime) and mini-series (by showType) can be classified. Episodes
    // cached before totalEps rode along carry no episode total, which is what a
    // collapsed show row counts against. Only callers that sort by date (the
    // watchlist) ask for releaseDate, so older caches aren't refetched app-wide
    // just to backfill it.
    const needsRefresh =
      (cached.type === 'movie' && !cached.isEpisode && cached.runtime === undefined) ||
      (cached.type === 'show' && !cached.isEpisode && cached.showType === undefined) ||
      (cached.isEpisode === true && cached.totalEps === undefined) ||
      (needReleaseDate === true && cached.releaseDate === undefined);
    return needsRefresh ? null : cached;
  } catch {
    return null;
  }
}

async function flush() {
  flushScheduled = false;
  const ids = queue;
  queue = [];
  if (ids.length === 0) return;

  const settle = (id: string, meta: ItemMeta | null) => {
    resolvers.get(id)?.(meta);
    resolvers.delete(id);
    inflight.delete(id);
  };

  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    try {
      const res = await fetch(`/api/meta?ids=${chunk.join(',')}`);
      if (!res.ok) { for (const id of chunk) settle(id, null); continue; }
      const data: Record<string, ItemMeta | null> = await res.json();
      for (const id of chunk) {
        const fresh = data[id] ?? null;
        // Stamped on the way OUT as well as into the cache. The history page keeps
        // its own copy and writes it back; hand it an unstamped object and the
        // stamp is gone the moment it does, so the entry looks stale again on the
        // very next load — a refetch every single time.
        const meta: CachedMeta | null = fresh ? { ...fresh, _fetchedAt: Date.now() } : null;
        if (meta) {
          try { localStorage.setItem(`meta-${id}`, JSON.stringify(meta)); } catch { /* ignore */ }
        }
        settle(id, meta);
      }
    } catch {
      // Never leave a caller waiting on a promise that can't resolve.
      for (const id of chunk) settle(id, null);
    }
  }
}

function load(id: string): Promise<ItemMeta | null> {
  const existing = inflight.get(id);
  if (existing) return existing;

  const promise = new Promise<ItemMeta | null>(resolve => resolvers.set(id, resolve));
  inflight.set(id, promise);
  queue.push(id);

  if (!flushScheduled) {
    flushScheduled = true;
    // Next tick, not this one: everything the current render asks for lands in
    // the same batch.
    setTimeout(flush, 0);
  }
  return promise;
}

export async function batchFetchMeta(
  ids: string[],
  opts?: { needReleaseDate?: boolean },
): Promise<Record<string, ItemMeta>> {
  const result: Record<string, ItemMeta> = {};
  const misses: string[] = [];

  for (const id of new Set(ids)) {
    const cached = readCache(id, opts?.needReleaseDate);
    if (cached) result[id] = cached;
    else misses.push(id);
  }

  if (misses.length > 0) {
    const fetched = await Promise.all(misses.map(load));
    misses.forEach((id, i) => {
      const meta = fetched[i];
      if (meta) result[id] = meta;
    });
  }

  return result;
}
