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
    const cached = JSON.parse(raw) as ItemMeta;
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
        const meta = data[id] ?? null;
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
