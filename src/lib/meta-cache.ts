import type { ItemMeta } from '@/app/api/meta/[id]/route';

// What titles ARE, kept on this device: poster, title, year, score, episode total.
//
// It is a cache — everything in it came from /api/meta and can be fetched again —
// but it used to be kept like a library. Every title a page had ever shown got its
// own `meta-<id>` key and nothing was ever removed, so browsing Watch History and
// Ratings once on a 4,400-film account with 13,000 episodes left 16,174 keys and
// 6.9M characters: more than a phone gives a site. Past that the browser refuses
// every write, and ratings and watched marks stop landing on the device without a
// word, because every write here swallows its error.
//
// So it is bounded now:
//   - Films and shows keep one `meta-<id>` key each, at most TITLE_LIMIT of them.
//     The ones asked for least recently go first.
//   - Episodes share ONE key, `recent-episodes`, at most EPISODE_LIMIT of them.
//     They were most of those 16,174 keys, and no list needs all of them: History
//     groups episodes from the id alone, and the show's own entry carries the
//     episode total. Only a row naming a single episode needs that episode's entry.
//   - The per-episode keys an older version left behind are removed, once.
//
// Every read and write of this cache goes through here — a test holds the rest of
// src to that — so no page can walk around the limits by writing its own key.

/** A cache entry plus when we wrote it. The stamp is ours, not TMDB's. */
export type CachedMeta = ItemMeta & { _fetchedAt?: number };

export const TITLE_LIMIT = 1500;
export const EPISODE_LIMIT = 300;

const TITLE_PREFIX = 'meta-';
const EPISODES_KEY = 'recent-episodes';
// Deliberately not under meta-: trims walk those keys, and logout clears them.
const CLEANED_FLAG = 'title-cache-v2';

const EPISODE_ID = /-S\d+E\d+$/;
const isEpisodeId = (id: string) => EPISODE_ID.test(id);

let owner: Storage | null = null;
let cleaned = false;
// Each stored film or show, and how recently it was wanted. Built from the stored
// stamps the first time a write needs it, then kept up to date as writes land.
let titleRanks: Map<string, number> | null = null;
let episodes: Map<string, CachedMeta> | null = null;
// Ranks handed out this session. They beat a stored stamp: an entry fetched last
// week and shown a second ago is recent, whatever its stamp says.
const asked = new Map<string, number>();
let lastStamp = 0;

function storage(): Storage | null {
  const ls = typeof localStorage === 'undefined' ? null : localStorage;
  // A different localStorage object (a test stub) holds different data.
  if (ls !== owner) { owner = ls; forgetMetaCache(); }
  return ls;
}

/** Drops what is held in memory, so the next read starts from localStorage. */
export function forgetMetaCache(): void {
  cleaned = false;
  titleRanks = null;
  episodes = null;
  asked.clear();
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', e => {
    // Another tab cleared storage, or changed the episode list under us. Another
    // tab's title writes only make the count drift a little; the next load recounts.
    if (e.key === null) forgetMetaCache();
    else if (e.key === EPISODES_KEY) episodes = null;
  });
}

function keysOf(ls: Storage): string[] {
  const keys: string[] = [];
  for (let i = 0; i < ls.length; i++) {
    const k = ls.key(i);
    if (k) keys.push(k);
  }
  return keys;
}

// The per-episode keys from before. Removed rather than moved into the list: it is
// only a cache, and a device holding thousands of them is the device already full.
function cleanOnce(ls: Storage): void {
  if (cleaned) return;
  cleaned = true;
  try {
    if (ls.getItem(CLEANED_FLAG) === '1') return;
    for (const k of keysOf(ls)) {
      if (k.startsWith(TITLE_PREFIX) && isEpisodeId(k)) ls.removeItem(k);
    }
    ls.setItem(CLEANED_FLAG, '1');
  } catch { /* ignore */ }
}

function nextStamp(): number {
  lastStamp = Math.max(Date.now(), lastStamp + 1);
  return lastStamp;
}

/**
 * Marks ids as wanted just now, the first in the list most of all.
 *
 * Callers hand over whole lists in the order they show them, so when a list is
 * longer than the cache holds it is the top of it that stays — the rows on screen
 * first — rather than whichever rows happened to come back from the server last.
 */
export function touchCachedMeta(ids: string[]): void {
  if (ids.length === 0) return;
  const base = nextStamp();
  // Spread inside one millisecond, so the next call outranks every one of these.
  // Past a few thousand ids neighbours can share a rank, which only blurs the
  // order deep in a list nobody is looking at.
  for (let i = 0; i < ids.length; i++) {
    asked.set(ids[i], base + (ids.length - i) / (ids.length + 1));
  }
}

function loadTitleRanks(ls: Storage): Map<string, number> {
  if (titleRanks) return titleRanks;
  const ranks = new Map<string, number>();
  try {
    for (const k of keysOf(ls)) {
      if (!k.startsWith(TITLE_PREFIX) || isEpisodeId(k)) continue;
      // The stamp is all a trim needs, so it is picked out instead of parsing the
      // whole entry. An entry with no stamp is the oldest there is.
      const m = /"_fetchedAt":(\d+)/.exec(ls.getItem(k) ?? '');
      ranks.set(k.slice(TITLE_PREFIX.length), m ? Number(m[1]) : 0);
    }
  } catch { /* ignore */ }
  return (titleRanks = ranks);
}

function trimTitles(ls: Storage, limit: number): void {
  const ranks = loadTitleRanks(ls);
  if (ranks.size <= limit) return;
  const rankOf = (id: string) => asked.get(id) ?? ranks.get(id) ?? 0;
  const newestFirst = [...ranks.keys()].sort((a, b) => rankOf(b) - rankOf(a));
  for (const id of newestFirst.slice(limit)) {
    try { ls.removeItem(TITLE_PREFIX + id); } catch { /* ignore */ }
    ranks.delete(id);
  }
}

function loadEpisodes(ls: Storage): Map<string, CachedMeta> {
  if (episodes) return episodes;
  const map = new Map<string, CachedMeta>();
  try {
    const parsed: unknown = JSON.parse(ls.getItem(EPISODES_KEY) ?? 'null');
    if (parsed && typeof parsed === 'object') {
      for (const [id, m] of Object.entries(parsed)) {
        if (m && typeof m === 'object') map.set(id, m as CachedMeta);
      }
    }
  } catch { /* ignore */ }
  return (episodes = map);
}

function trimEpisodes(map: Map<string, CachedMeta>, limit: number): void {
  if (map.size <= limit) return;
  const rankOf = (id: string) => asked.get(id) ?? map.get(id)?._fetchedAt ?? 0;
  const newestFirst = [...map.keys()].sort((a, b) => rankOf(b) - rankOf(a));
  for (const id of newestFirst.slice(limit)) map.delete(id);
}

function saveEpisodes(ls: Storage, map: Map<string, CachedMeta>): void {
  const write = () => ls.setItem(EPISODES_KEY, JSON.stringify(Object.fromEntries(map)));
  try {
    write();
  } catch {
    // Storage is full. Half the list is still worth keeping; none of it is not.
    trimEpisodes(map, Math.floor(map.size / 2));
    try { write(); } catch { /* ignore */ }
  }
}

/** The cached entry for a film, show or episode, or null. Never touches the network. */
export function readCachedMeta(id: string): CachedMeta | null {
  const ls = storage();
  if (!ls) return null;
  cleanOnce(ls);
  if (isEpisodeId(id)) return loadEpisodes(ls).get(id) ?? null;
  try {
    const raw = ls.getItem(TITLE_PREFIX + id);
    return raw ? (JSON.parse(raw) as CachedMeta) : null;
  } catch {
    return null;
  }
}

/**
 * Stores entries, then trims back to the limits. Give a whole batch in one call:
 * the episode list is saved once per call, not once per episode.
 */
export function writeCachedMetaMany(entries: [string, CachedMeta][]): void {
  if (entries.length === 0) return;
  const ls = storage();
  if (!ls) return;
  cleanOnce(ls);

  let wroteTitles = false;
  let wroteEpisodes = false;

  for (const [id, meta] of entries) {
    // Written without being asked for first (a page caching the title it just
    // opened, an import): it is wanted now.
    if (!asked.has(id)) asked.set(id, nextStamp());

    if (isEpisodeId(id)) {
      loadEpisodes(ls).set(id, meta);
      wroteEpisodes = true;
      continue;
    }

    const ranks = loadTitleRanks(ls);
    const key = TITLE_PREFIX + id;
    const value = JSON.stringify(meta);
    const stamp = typeof meta._fetchedAt === 'number' ? meta._fetchedAt : 0;
    try {
      ls.setItem(key, value);
      ranks.set(id, stamp);
    } catch {
      // Storage is full. Make room from the titles wanted least and try once more,
      // so a full device frees itself rather than refusing every write from here on.
      trimTitles(ls, Math.floor(TITLE_LIMIT / 2));
      try { ls.setItem(key, value); ranks.set(id, stamp); } catch { /* ignore */ }
    }
    wroteTitles = true;
  }

  if (wroteTitles) trimTitles(ls, TITLE_LIMIT);
  if (wroteEpisodes) {
    const map = loadEpisodes(ls);
    trimEpisodes(map, EPISODE_LIMIT);
    saveEpisodes(ls, map);
  }
}

export function writeCachedMeta(id: string, meta: CachedMeta): void {
  writeCachedMetaMany([[id, meta]]);
}

// The old per-episode keys go as the app starts, not when a page first reads a
// title. On a device they have filled, the login sync's first writes — watched
// titles, ratings, dates — would otherwise be refused before anything got here.
if (typeof window !== 'undefined') {
  const ls = storage();
  if (ls) cleanOnce(ls);
}
