// Watched titles and your ratings on this device: one localStorage key each.
//
// They used to be one key per title — `watched-<id>` = "true" and
// `movie-rating-<id>` = "8" — so a 4,500-title library was 8,900 keys, and every
// list that needed "all my ratings" or "everything I've watched" walked every key
// in localStorage to find them. Now:
//   library-watched  ["tmdb-155","tmdb-27205",…]
//   library-ratings  {"tmdb-155":8,"tmdb-tv-1396-S1E2":9,…}
// Old per-title keys are folded in the first time either store is read on a
// device, then removed, so an upgraded device keeps everything without waiting
// for the login sync.
//
// Each store is parsed once and kept in memory, like the date indexes in media-id.

const WATCHED_KEY = 'library-watched';
const RATINGS_KEY = 'library-ratings';

// The old shapes. `watched-` also prefixes keys that were never a watched title.
const LEGACY_WATCHED_PREFIX = 'watched-';
const LEGACY_RATING_PREFIX = 'movie-rating-';
const NOT_A_WATCHED_TITLE = ['watched-ep-', 'watched-eps-index-', 'watched-show-eps-', 'watched-at-index'];

let owner: Storage | null = null;
let watched: Set<string> | null = null;
let ratings: Map<string, number> | null = null;

function storage(): Storage | null {
  const ls = typeof localStorage === 'undefined' ? null : localStorage;
  // A different localStorage object (a test stub) holds different data.
  if (ls !== owner) { owner = ls; watched = null; ratings = null; }
  return ls;
}

/** Drops the in-memory copies, so the next read parses localStorage again. */
export function forgetLibraryCache(): void {
  watched = null;
  ratings = null;
}

if (typeof window !== 'undefined') {
  // Another tab changed a store, cleared storage, or (still running the previous
  // version during a deploy) wrote an old per-title key that the next load folds in.
  window.addEventListener('storage', e => {
    if (
      e.key === null || e.key === WATCHED_KEY || e.key === RATINGS_KEY ||
      e.key.startsWith(LEGACY_WATCHED_PREFIX) || e.key.startsWith(LEGACY_RATING_PREFIX)
    ) forgetLibraryCache();
  });
}

function parseJSON<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

function saveWatched(ls: Storage, set: Set<string>) {
  try { ls.setItem(WATCHED_KEY, JSON.stringify([...set])); } catch { /* ignore */ }
}

function saveRatings(ls: Storage, map: Map<string, number>) {
  try { ls.setItem(RATINGS_KEY, JSON.stringify(Object.fromEntries(map))); } catch { /* ignore */ }
}

// Loads both stores and folds any old per-title keys into them. Done for both at
// once because one walk over localStorage finds both kinds.
function load(): { ls: Storage | null; watched: Set<string>; ratings: Map<string, number> } {
  const ls = storage();
  if (watched && ratings) return { ls, watched, ratings };
  const w = new Set<string>();
  const r = new Map<string, number>();
  if (!ls) { watched = w; ratings = r; return { ls, watched: w, ratings: r }; }

  const storedW = parseJSON<unknown>(ls.getItem(WATCHED_KEY), []);
  if (Array.isArray(storedW)) for (const id of storedW) if (typeof id === 'string') w.add(id);
  const storedR = parseJSON<unknown>(ls.getItem(RATINGS_KEY), {});
  if (storedR && typeof storedR === 'object') {
    for (const [id, s] of Object.entries(storedR as Record<string, unknown>)) {
      const n = Number(s);
      if (n > 0) r.set(id, n);
    }
  }

  const legacy: string[] = [];
  let foldedW = false, foldedR = false;
  try {
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (!k) continue;
      if (k.startsWith(LEGACY_RATING_PREFIX)) {
        legacy.push(k);
        const n = Number(ls.getItem(k));
        const id = k.slice(LEGACY_RATING_PREFIX.length);
        if (n > 0 && !r.has(id)) { r.set(id, n); foldedR = true; }
      } else if (k.startsWith(LEGACY_WATCHED_PREFIX) && !NOT_A_WATCHED_TITLE.some(p => k.startsWith(p))) {
        legacy.push(k);
        if (ls.getItem(k) === 'true') { w.add(k.slice(LEGACY_WATCHED_PREFIX.length)); foldedW = true; }
      }
    }
    if (foldedW) saveWatched(ls, w);
    if (foldedR) saveRatings(ls, r);
    for (const k of legacy) ls.removeItem(k);
  } catch { /* ignore */ }

  watched = w;
  ratings = r;
  return { ls, watched: w, ratings: r };
}

// ─── Watched titles ───────────────────────────────────────────────────────────

export function isWatchedTitle(id: string): boolean {
  return load().watched.has(id);
}

export function allWatchedTitleIds(): string[] {
  return [...load().watched];
}

export function setWatchedTitle(id: string, isWatched: boolean): void {
  const { ls, watched: set } = load();
  const had = set.has(id);
  if (isWatched === had) return;
  if (isWatched) set.add(id); else set.delete(id);
  if (ls) saveWatched(ls, set);
}

/** Marks many titles watched with one write (the login sync, an import). */
export function addWatchedTitles(ids: string[]): void {
  const { ls, watched: set } = load();
  let changed = false;
  for (const id of ids) if (!set.has(id)) { set.add(id); changed = true; }
  if (changed && ls) saveWatched(ls, set);
}

// ─── Ratings ──────────────────────────────────────────────────────────────────

/** Your score for a title, film, series or single episode, or undefined. */
export function readUserRating(id: string): number | undefined {
  return load().ratings.get(id);
}

/** Every score on this device, whatever it is for. */
export function allUserRatings(): { id: string; score: number }[] {
  return [...load().ratings].map(([id, score]) => ({ id, score }));
}

export function setUserRating(id: string, score: number): void {
  const { ls, ratings: map } = load();
  if (!(score > 0) || map.get(id) === score) return;
  map.set(id, score);
  if (ls) saveRatings(ls, map);
}

export function removeUserRating(id: string): void {
  const { ls, ratings: map } = load();
  if (map.delete(id) && ls) saveRatings(ls, map);
}

/** Many scores with one write (the login sync, an import). */
export function setUserRatings(entries: [id: string, score: number][]): void {
  const { ls, ratings: map } = load();
  let changed = false;
  for (const [id, score] of entries) {
    if (score > 0 && map.get(id) !== score) { map.set(id, score); changed = true; }
  }
  if (changed && ls) saveRatings(ls, map);
}
