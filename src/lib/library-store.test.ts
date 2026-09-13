import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  isWatchedTitle, allWatchedTitleIds, setWatchedTitle, addWatchedTitles,
  readUserRating, allUserRatings, setUserRating, removeUserRating, setUserRatings, forgetLibraryCache,
} from './library-store';

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

describe('library store', () => {
  let ls: ReturnType<typeof installLocalStorageStub>;
  beforeEach(() => { ls = installLocalStorageStub(); });

  it('marks and unmarks a watched title in one key', () => {
    setWatchedTitle('tmdb-155', true);
    expect(isWatchedTitle('tmdb-155')).toBe(true);
    forgetLibraryCache();
    expect(JSON.parse(ls.getItem('library-watched')!)).toEqual(['tmdb-155']);
    setWatchedTitle('tmdb-155', false);
    forgetLibraryCache();
    expect(isWatchedTitle('tmdb-155')).toBe(false);
  });

  it('stores, replaces and removes ratings for films, series and episodes', () => {
    setUserRating('tmdb-155', 8);
    setUserRatings([['tmdb-tv-1396', 10], ['tmdb-tv-1396-S5E14', 9], ['tmdb-155', 9]]);
    forgetLibraryCache();
    expect(readUserRating('tmdb-155')).toBe(9);
    expect(allUserRatings()).toHaveLength(3);
    removeUserRating('tmdb-tv-1396-S5E14');
    forgetLibraryCache();
    expect(readUserRating('tmdb-tv-1396-S5E14')).toBeUndefined();
  });

  it('writes once for many titles, and not at all when nothing changes', () => {
    const setItem = vi.spyOn(ls, 'setItem');
    addWatchedTitles(Array.from({ length: 4401 }, (_, i) => `tmdb-${i}`));
    setUserRatings(Array.from({ length: 4500 }, (_, i) => [`tmdb-${i}`, 7] as [string, number]));
    expect(setItem).toHaveBeenCalledTimes(2);
    addWatchedTitles(['tmdb-1']);
    setUserRatings([['tmdb-1', 7]]);
    expect(setItem).toHaveBeenCalledTimes(2);
  });

  it('folds the old per-title keys in on first read and removes them', () => {
    ls.setItem('watched-tmdb-155', 'true');
    ls.setItem('watched-tmdb-27205', 'false');           // unmarked: not watched
    ls.setItem('movie-rating-tmdb-155', '8');
    ls.setItem('movie-rating-tmdb-tv-1396-S1E2', '9');
    ls.setItem('watched-eps-index-tmdb-tv-1396', '["S1E2"]'); // not a watched title
    ls.setItem('watched-at-index', '{"v":2,"i":{},"e":{}}');   // not a watched title
    expect(allWatchedTitleIds()).toEqual(['tmdb-155']);
    expect(readUserRating('tmdb-tv-1396-S1E2')).toBe(9);
    expect(ls.getItem('watched-tmdb-155')).toBeNull();
    expect(ls.getItem('watched-tmdb-27205')).toBeNull();
    expect(ls.getItem('movie-rating-tmdb-155')).toBeNull();
    expect(ls.getItem('watched-eps-index-tmdb-tv-1396')).toBe('["S1E2"]');
    expect(ls.getItem('watched-at-index')).not.toBeNull();
    forgetLibraryCache();
    expect(isWatchedTitle('tmdb-155')).toBe(true);
    expect(readUserRating('tmdb-155')).toBe(8);
  });

  it('keeps a score already in the store over an older per-title key', () => {
    ls.setItem('library-ratings', JSON.stringify({ 'tmdb-155': 9 }));
    ls.setItem('movie-rating-tmdb-155', '4');
    expect(readUserRating('tmdb-155')).toBe(9);
  });
});

// Two shapes for one fact is how screens came to disagree before. If a file starts
// writing per-title keys again, every screen reading the store stops seeing them.
describe('nothing writes one key per title any more', () => {
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

  it('no source file reads or writes a watched-<id> or movie-rating-<id> key', () => {
    const perTitleKey = /localStorage\.(getItem|setItem|removeItem)\(\s*`(watched|movie-rating)-\$\{/;
    const offenders = files.filter(f => perTitleKey.test(readFileSync(f, 'utf8')));
    expect(offenders.map(f => f.slice(SRC.length + 1))).toEqual([]);
  });
});
