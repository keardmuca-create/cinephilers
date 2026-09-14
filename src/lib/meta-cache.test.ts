import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  readCachedMeta, writeCachedMeta, writeCachedMetaMany, touchCachedMeta, forgetMetaCache,
  TITLE_LIMIT, EPISODE_LIMIT, type CachedMeta,
} from './meta-cache';

// A localStorage with enough of the real thing to walk its keys, and a switch that
// makes the next few writes fail the way a full device does.
const store = new Map<string, string>();
let failNext = 0;
const ls = {
  get length() { return store.size; },
  key: (i: number) => [...store.keys()][i] ?? null,
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => {
    if (failNext > 0) { failNext--; throw new Error('QuotaExceededError'); }
    store.set(k, String(v));
  },
  removeItem: (k: string) => { store.delete(k); },
};

const film = (id: string, fetchedAt = Date.now()): CachedMeta =>
  ({ id, title: `Title ${id}`, year: '2024', poster: '', type: 'movie', runtime: 120, _fetchedAt: fetchedAt });
const episode = (id: string): CachedMeta =>
  ({ id, title: `Episode ${id}`, year: '2024', poster: '', type: 'show', isEpisode: true, totalEps: 10, _fetchedAt: Date.now() });

const titleKeys = () => [...store.keys()].filter(k => k.startsWith('meta-'));

beforeEach(() => {
  store.clear();
  failNext = 0;
  vi.stubGlobal('localStorage', ls);
  forgetMetaCache();
});

afterEach(() => { vi.unstubAllGlobals(); });

describe('clearing the old per-episode notes', () => {
  it('removes them once and leaves films and shows alone', () => {
    store.set('meta-tmdb-tv-1396-S1E1', JSON.stringify(episode('tmdb-tv-1396-S1E1')));
    store.set('meta-tmdb-tv-1396-S5E16', JSON.stringify(episode('tmdb-tv-1396-S5E16')));
    store.set('meta-tmdb-155', JSON.stringify(film('tmdb-155')));
    store.set('meta-tmdb-tv-1396', JSON.stringify({ id: 'tmdb-tv-1396', type: 'show', totalEps: 62 }));

    expect(readCachedMeta('tmdb-155')?.title).toBe('Title tmdb-155');
    expect(titleKeys().sort()).toEqual(['meta-tmdb-155', 'meta-tmdb-tv-1396']);
  });

  it('does not walk storage again once a device is done', () => {
    readCachedMeta('tmdb-1');
    // Something an old tab wrote after the clean. Not worth a walk on every load.
    store.set('meta-tmdb-tv-2-S1E1', '{}');
    forgetMetaCache();
    readCachedMeta('tmdb-1');
    expect(store.has('meta-tmdb-tv-2-S1E1')).toBe(true);
  });
});

describe('episodes', () => {
  it('share one key instead of one each', () => {
    writeCachedMeta('tmdb-tv-1396-S1E1', episode('tmdb-tv-1396-S1E1'));
    expect(titleKeys()).toEqual([]);
    expect(store.has('recent-episodes')).toBe(true);
    forgetMetaCache(); // read back from storage, not memory
    expect(readCachedMeta('tmdb-tv-1396-S1E1')?.title).toBe('Episode tmdb-tv-1396-S1E1');
  });

  it('keeps the most recent EPISODE_LIMIT and drops the rest', () => {
    const ids = Array.from({ length: EPISODE_LIMIT + 20 }, (_, i) => `tmdb-tv-1-S1E${i + 1}`);
    for (const id of ids) writeCachedMeta(id, episode(id));
    const kept = Object.keys(JSON.parse(store.get('recent-episodes')!));
    expect(kept).toHaveLength(EPISODE_LIMIT);
    expect(readCachedMeta(ids[0])).toBeNull();
    expect(readCachedMeta(ids[ids.length - 1])).not.toBeNull();
  });

  it('saves the list once for a whole batch', () => {
    const setItem = vi.spyOn(ls, 'setItem');
    const ids = Array.from({ length: 100 }, (_, i) => `tmdb-tv-1-S1E${i + 1}`);
    writeCachedMetaMany(ids.map(id => [id, episode(id)]));
    expect(setItem.mock.calls.filter(([k]) => k === 'recent-episodes')).toHaveLength(1);
  });
});

describe('films and shows', () => {
  it('stop at TITLE_LIMIT', () => {
    const ids = Array.from({ length: TITLE_LIMIT + 100 }, (_, i) => `tmdb-${i}`);
    writeCachedMetaMany(ids.map(id => [id, film(id)]));
    expect(titleKeys()).toHaveLength(TITLE_LIMIT);
  });

  // The History page asks for a whole library in display order and the answers
  // come back 100 at a time. The rows on screen first must be the ones kept.
  it('keep the top of a long list, not the last rows to come back', () => {
    const ids = Array.from({ length: 2000 }, (_, i) => `tmdb-${i}`);
    touchCachedMeta(ids);
    for (let i = 0; i < ids.length; i += 100) {
      writeCachedMetaMany(ids.slice(i, i + 100).map(id => [id, film(id)]));
    }
    expect(readCachedMeta('tmdb-0')).not.toBeNull();
    expect(readCachedMeta(`tmdb-${TITLE_LIMIT - 1}`)).not.toBeNull();
    expect(readCachedMeta(`tmdb-${TITLE_LIMIT}`)).toBeNull();
    expect(readCachedMeta('tmdb-1999')).toBeNull();
  });

  it('keep a title asked for again over one that was not', () => {
    for (let i = 0; i < TITLE_LIMIT; i++) writeCachedMeta(`tmdb-${i}`, film(`tmdb-${i}`));
    touchCachedMeta(['tmdb-0']);
    writeCachedMeta('tmdb-new', film('tmdb-new'));
    expect(readCachedMeta('tmdb-0')).not.toBeNull();
    expect(readCachedMeta('tmdb-1')).toBeNull();
  });

  // A new page load has no ranks in memory, only what was stored.
  it('drop the oldest stored stamps first in a fresh session', () => {
    for (let i = 0; i < TITLE_LIMIT; i++) store.set(`meta-tmdb-${i}`, JSON.stringify(film(`tmdb-${i}`, 1000 + i)));
    forgetMetaCache();
    writeCachedMeta('tmdb-new', film('tmdb-new'));
    expect(store.has('meta-tmdb-0')).toBe(false);
    expect(store.has('meta-tmdb-1')).toBe(true);
    expect(store.has('meta-tmdb-new')).toBe(true);
  });

  it('make room and try again when storage is full', () => {
    for (let i = 0; i < TITLE_LIMIT; i++) writeCachedMeta(`tmdb-${i}`, film(`tmdb-${i}`));
    failNext = 1;
    writeCachedMeta('tmdb-new', film('tmdb-new'));
    expect(store.has('meta-tmdb-new')).toBe(true);
    expect(titleKeys().length).toBeLessThanOrEqual(TITLE_LIMIT / 2 + 1);
  });
});

it('forgets what it held once logout has cleared storage', () => {
  writeCachedMeta('tmdb-tv-1-S1E1', episode('tmdb-tv-1-S1E1'));
  store.delete('recent-episodes'); // what clearUserData does
  forgetMetaCache();
  expect(readCachedMeta('tmdb-tv-1-S1E1')).toBeNull();
});

// If a page reads or writes a `meta-<id>` key itself, episodes land back in their
// own keys and nothing counts titles against the limit.
describe('nothing else touches the cache keys', () => {
  const SRC = join(process.cwd(), 'src');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { if (name !== 'generated') walk(p); }
      else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(p);
    }
  };
  walk(SRC);

  it('no source file but meta-cache reads or writes a meta-<id> key', () => {
    const cacheKey = /localStorage\.(getItem|setItem|removeItem)\(\s*`meta-\$\{/;
    const offenders = files
      .filter(f => !f.endsWith(join('lib', 'meta-cache.ts')))
      .filter(f => cacheKey.test(readFileSync(f, 'utf8')));
    expect(offenders.map(f => f.slice(SRC.length + 1))).toEqual([]);
  });
});
