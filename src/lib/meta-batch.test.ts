import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { batchFetchMeta } from './meta-batch';

// Minimal localStorage + fetch stubs — the batcher only needs a cache to read
// and a network to call.
const store = new Map<string, string>();
const localStorageStub = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
};

const meta = (id: string) => ({ id, title: `Title ${id}`, year: '2024', poster: '', type: 'movie', runtime: 120 });

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
    store.set('meta-tmdb-1', JSON.stringify(meta('tmdb-1')));
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

  it('refetches an episode cached before it carried its show total', async () => {
    store.set('meta-tmdb-tv-1-S1E1', JSON.stringify({ id: 'tmdb-tv-1-S1E1', title: 'Ep', isEpisode: true, type: 'show' }));
    await batchFetchMeta(['tmdb-tv-1-S1E1']);
    expect(calls).toHaveLength(1);
  });
});
