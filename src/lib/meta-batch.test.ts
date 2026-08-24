import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { batchFetchMeta, isStaleMeta } from './meta-batch';

// Minimal localStorage + fetch stubs — the batcher only needs a cache to read
// and a network to call.
const store = new Map<string, string>();
const localStorageStub = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
};

// Ids carrying "tv" come back as shows, which is what the server does too — the
// staleness rule only applies to shows, so the tests need both kinds.
const meta = (id: string) => id.includes('tv')
  ? { id, title: `Title ${id}`, year: '2024', poster: '', type: 'show', showType: 'Scripted', totalEps: 64 }
  : { id, title: `Title ${id}`, year: '2024', poster: '', type: 'movie', runtime: 120 };

const DAY = 24 * 60 * 60 * 1000;

let calls: string[][] = [];

beforeEach(() => {
  store.clear();
  calls = [];
  vi.stubGlobal('localStorage', localStorageStub);
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const ids = new URL(url, 'http://x').searchParams.get('ids')!.split(',');
    calls.push(ids);
    return {
      ok: true,
      json: async () => Object.fromEntries(ids.map(id => [id, meta(id)])),
    } as unknown as Response;
  }));
});

afterEach(() => { vi.unstubAllGlobals(); });

describe('batchFetchMeta', () => {
  it('answers from the cache without touching the network', async () => {
    // Stamped now that films expire too: an unstamped entry counts as stale and
    // earns one refetch, which is a different test (below).
    store.set('meta-tmdb-1', JSON.stringify({ ...meta('tmdb-1'), _fetchedAt: Date.now() }));
    const got = await batchFetchMeta(['tmdb-1']);
    expect(got['tmdb-1'].title).toBe('Title tmdb-1');
    expect(calls).toHaveLength(0);
  });

  // The whole point: five sections asking at once is one request, not five.
  it('gathers separate callers in the same tick into ONE request', async () => {
    const [a, b, c] = await Promise.all([
      batchFetchMeta(['tmdb-1', 'tmdb-2']),
      batchFetchMeta(['tmdb-3']),
      batchFetchMeta(['tmdb-4']),
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0].sort()).toEqual(['tmdb-1', 'tmdb-2', 'tmdb-3', 'tmdb-4']);
    expect(a['tmdb-1'].title).toBe('Title tmdb-1');
    expect(b['tmdb-3'].title).toBe('Title tmdb-3');
    expect(c['tmdb-4'].title).toBe('Title tmdb-4');
  });

  it('asks for an id once even when several callers want it', async () => {
    await Promise.all([
      batchFetchMeta(['tmdb-9']),
      batchFetchMeta(['tmdb-9']),
      batchFetchMeta(['tmdb-9', 'tmdb-8']),
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0].sort()).toEqual(['tmdb-8', 'tmdb-9']);
  });

  it('does not ask twice for the same id in one call', async () => {
    await batchFetchMeta(['tmdb-5', 'tmdb-5']);
    expect(calls[0]).toEqual(['tmdb-5']);
  });

  it('writes what it fetched to the cache', async () => {
    await batchFetchMeta(['tmdb-7']);
    expect(store.has('meta-tmdb-7')).toBe(true);
    calls = [];
    await batchFetchMeta(['tmdb-7']);
    expect(calls).toHaveLength(0);
  });

  // A caller left awaiting a promise that never settles is a section that never
  // renders, which is worse than a missing poster.
  it('resolves rather than hangs when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    const got = await batchFetchMeta(['tmdb-6']);
    expect(got).toEqual({});
  });

  it('resolves rather than hangs on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false }) as unknown as Response));
    const got = await batchFetchMeta(['tmdb-6']);
    expect(got).toEqual({});
  });

  // The bug this rule exists for: a show you had finished gets a new episode, and
  // the device that cached it keeps saying 63 / 63 with a filled eye for good.
  it('refetches a show cached more than a day ago', async () => {
    store.set('meta-tmdb-tv-1', JSON.stringify({ ...meta('tmdb-tv-1'), totalEps: 63, _fetchedAt: Date.now() - DAY - 1000 }));
    const got = await batchFetchMeta(['tmdb-tv-1']);
    expect(calls).toHaveLength(1);
    expect(got['tmdb-tv-1'].totalEps).toBe(64);
  });

  it('trusts a show cached an hour ago', async () => {
    store.set('meta-tmdb-tv-2', JSON.stringify({ ...meta('tmdb-tv-2'), _fetchedAt: Date.now() - 60 * 60 * 1000 }));
    await batchFetchMeta(['tmdb-tv-2']);
    expect(calls).toHaveLength(0);
  });

  // Entries written before stamping existed, and by the pages that write this
  // cache directly, have no stamp at all. One refetch, then they carry one.
  it('refetches a show with no stamp, once', async () => {
    store.set('meta-tmdb-tv-3', JSON.stringify(meta('tmdb-tv-3')));
    await batchFetchMeta(['tmdb-tv-3']);
    expect(calls).toHaveLength(1);
    calls = [];
    await batchFetchMeta(['tmdb-tv-3']);
    expect(calls).toHaveLength(0);
  });

  // Films used to be exempt entirely, on the grounds that a released film is
  // finished. Everything a film IS stays fixed — but its rating does not, and a
  // permanent cache meant a row could show a score from the week it was first
  // opened. Three days rather than the shows' one: the drift is real but slow.
  it('expires a film older than three days', async () => {
    store.set('meta-tmdb-4', JSON.stringify({ ...meta('tmdb-4'), _fetchedAt: Date.now() - 4 * DAY }));
    await batchFetchMeta(['tmdb-4']);
    expect(calls).toHaveLength(1);
  });

  it('does not refetch a film on the shows clock', async () => {
    // Two days old: a show would be refetched here, a film should not be.
    store.set('meta-tmdb-6', JSON.stringify({ ...meta('tmdb-6'), _fetchedAt: Date.now() - 2 * DAY }));
    await batchFetchMeta(['tmdb-6']);
    expect(calls).toHaveLength(0);
  });

  // The history page keeps its own copy and writes it back. If what it got had no
  // stamp, writing it back would strip one — and every load would refetch.
  it('hands back a stamped copy, so a caller writing it back keeps the stamp', async () => {
    const got = await batchFetchMeta(['tmdb-tv-5']);
    const returned = got['tmdb-tv-5'] as (typeof got)['tmdb-tv-5'] & { _fetchedAt?: number };
    expect(typeof returned._fetchedAt).toBe('number');
    store.set('meta-tmdb-tv-5', JSON.stringify(returned));
    calls = [];
    await batchFetchMeta(['tmdb-tv-5']);
    expect(calls).toHaveLength(0);
  });

  it('refetches an episode cached before it carried its show total', async () => {
    store.set('meta-tmdb-tv-1-S1E1', JSON.stringify({ id: 'tmdb-tv-1-S1E1', title: 'Ep', isEpisode: true, type: 'show' }));
    await batchFetchMeta(['tmdb-tv-1-S1E1']);
    expect(calls).toHaveLength(1);
  });
});

describe('isStaleMeta', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const ago = (ms: number) => Date.now() - ms;

  it('treats a show older than a day as stale', () => {
    expect(isStaleMeta({ id: 'x', type: 'show', _fetchedAt: ago(DAY + 1000) } as never)).toBe(true);
  });

  it('leaves a show fetched within the day alone', () => {
    expect(isStaleMeta({ id: 'x', type: 'show', _fetchedAt: ago(DAY - 1000) } as never)).toBe(false);
  });

  // Films used to be exempt entirely, which is how a row kept showing a rating
  // from the week it was first opened. Everything ELSE about a film really is
  // fixed, so they expire on a slower clock than shows.
  it('treats a film older than three days as stale', () => {
    expect(isStaleMeta({ id: 'x', type: 'movie', _fetchedAt: ago(3 * DAY + 1000) } as never)).toBe(true);
  });

  it('leaves a film fetched within three days alone', () => {
    expect(isStaleMeta({ id: 'x', type: 'movie', _fetchedAt: ago(2 * DAY) } as never)).toBe(false);
  });

  it('does not expire a film on the show clock', () => {
    // A day and a half old: stale for a show, still fresh for a film.
    expect(isStaleMeta({ id: 'x', type: 'movie', _fetchedAt: ago(DAY + DAY / 2) } as never)).toBe(false);
  });

  it('still never expires episodes', () => {
    // They carry the parent's total and cost two TMDB fetches to check.
    expect(isStaleMeta({ id: 'x', type: 'show', isEpisode: true, _fetchedAt: 0 } as never)).toBe(false);
  });

  it('treats an unstamped entry as stale so it gets a stamp', () => {
    expect(isStaleMeta({ id: 'x', type: 'movie' } as never)).toBe(true);
    expect(isStaleMeta({ id: 'x', type: 'show' } as never)).toBe(true);
  });

  it('says nothing about a missing entry', () => {
    expect(isStaleMeta(null)).toBe(false);
    expect(isStaleMeta(undefined)).toBe(false);
  });
});
