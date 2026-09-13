import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { readShowEpisodes, isEpisodeWatched, allWatchedEpisodeIds, dropLegacyEpisodeKeys } from './episode-store';

function installLocalStorageStub() {
  const store = new Map<string, string>();
  const ls = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  };
  vi.stubGlobal('localStorage', ls);
  return ls;
}

describe('episode store', () => {
  beforeEach(() => { installLocalStorageStub(); });

  it('reads one show\'s watched episodes from its list', () => {
    localStorage.setItem('watched-eps-index-tmdb-tv-1396', JSON.stringify(['S1E1', 'S1E2']));
    expect(readShowEpisodes('tmdb-tv-1396')).toEqual(['S1E1', 'S1E2']);
    expect(isEpisodeWatched('tmdb-tv-1396', 'S1E2')).toBe(true);
    expect(isEpisodeWatched('tmdb-tv-1396', 'S2E1')).toBe(false);
  });

  it('treats a missing or broken list as nothing watched', () => {
    expect(readShowEpisodes('tmdb-tv-1')).toEqual([]);
    localStorage.setItem('watched-eps-index-tmdb-tv-2', 'not json');
    expect(isEpisodeWatched('tmdb-tv-2', 'S1E1')).toBe(false);
  });

  it('lists every watched episode as a full id, from the per-show lists only', () => {
    localStorage.setItem('watched-eps-index-tmdb-tv-1396', JSON.stringify(['S1E1', 'S1E2']));
    localStorage.setItem('watched-eps-index-tmdb-tv-60059', JSON.stringify(['S4E3']));
    localStorage.setItem('watched-tmdb-155', 'true');
    // A leftover old-style key is not a second source.
    localStorage.setItem('watched-ep-tmdb-tv-999-S1E1', 'true');
    expect(allWatchedEpisodeIds().sort()).toEqual(['tmdb-tv-1396-S1E1', 'tmdb-tv-1396-S1E2', 'tmdb-tv-60059-S4E3']);
  });

  it('drops the old per-episode keys and nothing else', () => {
    localStorage.setItem('watched-ep-tmdb-tv-1396-S1E1', 'true');
    localStorage.setItem('watched-ep-tmdb-tv-1396-S1E2', 'true');
    localStorage.setItem('watched-eps-index-tmdb-tv-1396', JSON.stringify(['S1E1', 'S1E2']));
    localStorage.setItem('watched-tmdb-155', 'true');
    expect(dropLegacyEpisodeKeys()).toBe(2);
    expect(localStorage.getItem('watched-ep-tmdb-tv-1396-S1E1')).toBeNull();
    expect(readShowEpisodes('tmdb-tv-1396')).toEqual(['S1E1', 'S1E2']);
    expect(localStorage.getItem('watched-tmdb-155')).toBe('true');
  });
});

// The per-episode keys cost 18% of a large account's storage. If one screen starts
// writing them again, every screen that stopped reading them silently disagrees with it.
describe('nothing writes one key per episode any more', () => {
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

  it('no source file builds a watched-ep-<id> key', () => {
    const offenders = files.filter(f => readFileSync(f, 'utf8').includes('watched-ep-${'));
    expect(offenders).toEqual([]);
  });
});
