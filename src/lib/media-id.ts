// Canonical id helpers.
//
// The app stores movie/show ids as `tmdb-{n}` (movies) and `tmdb-tv-{n}` (shows),
// with episodes as `tmdb-tv-{n}-S{s}E{e}`. Older imports wrote movie ids as a bare
// number (e.g. "262504"), which made the SAME film live under two ids and show up
// twice in watch history / ratings. canonicalId() folds a bare movie id into the
// `tmdb-` form so both map to one entry.

export function canonicalId(id: string): string {
  return /^\d+$/.test(id) ? `tmdb-${id}` : id;
}

// Strict shape check used by API routes on client-supplied ids (after
// canonicalId): movies are `tmdb-{n}`, shows `tmdb-tv-{n}`. Rejects episode
// ids, arbitrary strings, and oversized garbage before they reach the DB.
export function isValidMediaId(id: string): boolean {
  return /^tmdb-(?:tv-)?\d{1,10}$/.test(id);
}

// A whole show: `tmdb-tv-{n}`, with no season/episode suffix. Distinct from
// isEpisodeId — one names a series, the other one instalment of it.
export function isShowId(id: string): boolean {
  return /^tmdb-tv-\d{1,10}$/.test(id);
}

// An individual episode id: `tmdb-tv-{n}-S{s}E{e}`.
export function isEpisodeId(id: string): boolean {
  return /^tmdb-tv-\d{1,10}-S\d{1,3}E\d{1,4}$/.test(id);
}

// Ids that may carry a rating or a review — films, shows, AND single episodes.
// Deliberately broader than isValidMediaId: you rate one episode, but you
// watchlist/favourite/daily-pick a whole show, so those stay strict.
export function isRateableMediaId(id: string): boolean {
  return isValidMediaId(id) || isEpisodeId(id);
}

// Parse an episode id into its parts, or null if it isn't one.
export function parseEpisodeId(id: string): { showId: string; season: number; episode: number } | null {
  const m = id.match(/^(tmdb-tv-\d{1,10})-S(\d{1,3})E(\d{1,4})$/);
  return m ? { showId: m[1], season: Number(m[2]), episode: Number(m[3]) } : null;
}

// The bare-numeric legacy id for a canonical movie id, or null if there isn't one.
// `tmdb-262504` → `262504`; `tmdb-tv-123` / episode ids → null.
export function legacyTwin(id: string): string | null {
  const m = id.match(/^tmdb-(\d+)$/);
  return m ? m[1] : null;
}

const MIGRATION_FLAG = 'media-id-normalized-v1';

// Per-prefix localStorage keys that are keyed by a media id.
// `watched-` is included but its episode/index variants are skipped because the id
// remainder after the prefix isn't a bare number for those, so canonicalId leaves
// them alone — but we still guard explicitly for clarity.
const ID_PREFIXES = ['meta-', 'watched-', 'movie-rating-', 'watchlist-', 'review-'];

function shouldSkip(key: string): boolean {
  return (
    key.startsWith('watched-ep-') ||
    key.startsWith('watched-eps-index-') ||
    key.startsWith('watched-show-eps-')
  );
}

// One-time merge of bare-numeric movie keys into their `tmdb-` form. Idempotent and
// guarded by a flag, but safe to run more than once.
export function normalizeLocalMediaIds(): void {
  try {
    if (localStorage.getItem(MIGRATION_FLAG) === 'true') return;

    // Snapshot keys first — we mutate localStorage inside the loop.
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) keys.push(k);
    }

    for (const key of keys) {
      if (shouldSkip(key)) continue;
      const prefix = ID_PREFIXES.find(p => key.startsWith(p));
      if (!prefix) continue;
      const id = key.slice(prefix.length);
      if (!/^\d+$/.test(id)) continue; // only bare-numeric movie ids

      const canonicalKey = `${prefix}${canonicalId(id)}`;
      if (canonicalKey === key) continue;

      const value = localStorage.getItem(key);
      // Keep an existing canonical entry; otherwise promote the bare one.
      if (localStorage.getItem(canonicalKey) === null && value !== null) {
        localStorage.setItem(canonicalKey, value);
      }
      localStorage.removeItem(key);
    }

    // watch-log: rewrite ids, then collapse duplicates (keep newest per id+type).
    try {
      const raw = localStorage.getItem('watch-log');
      if (raw) {
        const log = JSON.parse(raw) as { id: string; type?: string; loggedAt?: string }[];
        const byKey = new Map<string, { id: string; type?: string; loggedAt?: string }>();
        for (const entry of log) {
          if (!entry.id) continue;
          const cid = canonicalId(entry.id);
          const next = { ...entry, id: cid };
          const k = `${cid}:${entry.type ?? ''}`;
          const prev = byKey.get(k);
          if (!prev || new Date(next.loggedAt ?? 0).getTime() > new Date(prev.loggedAt ?? 0).getTime()) {
            byKey.set(k, next);
          }
        }
        localStorage.setItem('watch-log', JSON.stringify([...byKey.values()]));
      }
    } catch { /* ignore */ }

    localStorage.setItem(MIGRATION_FLAG, 'true');
  } catch { /* ignore */ }
}

// ─── Date indexes: how they are stored ───────────────────────────────────────
// The four id → date indexes below (added, watched, rated, manual watch) are one
// localStorage key each, so their format decides how much of a library's storage
// they cost. The first format was a flat map of full ISO strings:
//   {"tmdb-tv-1396-S1E1":"2024-05-02T00:00:00.000Z", …}
// For a 4,401-film account with 12,946 episodes the watched index alone was
// 800,000 characters, a third of everything that account stored. Now:
//   {"v":2,"i":{"tmdb-157336":"lk3m2x9s"},"e":{"tmdb-tv-1396":{"lk3m2x9s":"S1E1,S1E2"}}}
// Dates are base-36 milliseconds, and episodes sit under their show grouped by
// date, because an imported or synced show stamps every episode with one date.
// Old-format values are still read and are rewritten in this format on the next
// write, which the login sync makes for all of them.
//
// Each index is parsed once and kept in memory. Watch History asks for the date
// of every watched film and episode in turn, and each lookup used to parse the
// whole index again: 12,946 parses of an 800,000-character string per page load.

export type DateEntry = [id: string, iso?: string];
type DateIndex = Map<string, number>;

const EPISODE_ID_RE = /^(tmdb-tv-\d+)-(S\d+E\d+)$/;

const indexCache = new Map<string, DateIndex>();
let cacheOwner: Storage | null = null;

function cachedIndexes(): Map<string, DateIndex> {
  // A different localStorage object (a test stub) holds different data.
  const ls = typeof localStorage === 'undefined' ? null : localStorage;
  if (ls !== cacheOwner) { indexCache.clear(); cacheOwner = ls; }
  return indexCache;
}

/** Drops the in-memory copies, so the next read parses localStorage again. */
export function forgetDateIndexCache(): void {
  indexCache.clear();
}

if (typeof window !== 'undefined') {
  // Another tab changed an index (or cleared storage): our copy is out of date.
  window.addEventListener('storage', e => {
    if (e.key === null) indexCache.clear();
    else indexCache.delete(e.key);
  });
}

function parseIndex(raw: string | null): DateIndex {
  const index: DateIndex = new Map();
  if (!raw) return index;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return index;
    const o = parsed as Record<string, unknown>;
    if (o.v === 2) {
      for (const [id, d] of Object.entries((o.i ?? {}) as Record<string, string>)) {
        const t = parseInt(d, 36);
        if (Number.isFinite(t)) index.set(id, t);
      }
      for (const [show, byDate] of Object.entries((o.e ?? {}) as Record<string, Record<string, string>>)) {
        for (const [d, eps] of Object.entries(byDate ?? {})) {
          const t = parseInt(d, 36);
          if (!Number.isFinite(t)) continue;
          for (const ep of String(eps).split(',')) if (ep) index.set(`${show}-${ep}`, t);
        }
      }
    } else {
      // The first format: a flat map of ISO strings.
      for (const [id, iso] of Object.entries(o)) {
        const t = typeof iso === 'string' ? new Date(iso).getTime() : NaN;
        if (!Number.isNaN(t)) index.set(id, t);
      }
    }
  } catch { /* unreadable: start empty */ }
  return index;
}

function serializeIndex(index: DateIndex): string {
  const i: Record<string, string> = {};
  const grouped: Record<string, Record<string, string[]>> = {};
  for (const [id, t] of index) {
    const d = t.toString(36);
    const ep = EPISODE_ID_RE.exec(id);
    if (ep) ((grouped[ep[1]] ??= {})[d] ??= []).push(ep[2]);
    else i[id] = d;
  }
  const e: Record<string, Record<string, string>> = {};
  for (const [show, byDate] of Object.entries(grouped)) {
    e[show] = Object.fromEntries(Object.entries(byDate).map(([d, eps]) => [d, eps.join(',')]));
  }
  return JSON.stringify({ v: 2, i, e });
}

// Indexes read in the old format. They are rewritten at the next record call even
// when no date changes: the login sync mostly re-records dates the index already
// holds, and writing only on a change left every upgraded device on the old,
// three-times-larger format for good.
const oldFormatKeys = new Set<string>();

function readIndex(key: string): DateIndex {
  const cache = cachedIndexes();
  let index = cache.get(key);
  if (!index) {
    let raw: string | null = null;
    try { raw = localStorage.getItem(key); } catch { /* ignore */ }
    index = parseIndex(raw);
    if (raw && !raw.startsWith('{"v":2')) oldFormatKeys.add(key);
    else oldFormatKeys.delete(key);
    cache.set(key, index);
  }
  return index;
}

function writeIndex(key: string, index: DateIndex): void {
  cachedIndexes().set(key, index);
  try {
    localStorage.setItem(key, serializeIndex(index));
    oldFormatKeys.delete(key);
  } catch { /* ignore */ }
}

// A stamp in milliseconds: the ISO given, or now when it's missing or unreadable.
function toTime(iso?: string): number {
  const t = iso === undefined ? Date.now() : new Date(iso).getTime();
  return Number.isNaN(t) ? Date.now() : t;
}

function recordDates(key: string, entries: DateEntry[], keep: 'earliest' | 'latest'): void {
  if (entries.length === 0) return;
  try {
    const index = readIndex(key);
    let changed = false;
    for (const [id, iso] of entries) {
      const t = toTime(iso);
      const cid = canonicalId(id);
      const existing = index.get(cid);
      if (existing === undefined || (keep === 'latest' ? t > existing : t < existing)) {
        index.set(cid, t);
        changed = true;
      }
    }
    if (changed || oldFormatKeys.has(key)) writeIndex(key, index);
  } catch { /* ignore */ }
}

function dateOf(key: string, id: string): number | undefined {
  try { return readIndex(key).get(canonicalId(id)); } catch { return undefined; }
}

function forgetDate(key: string, id: string): void {
  try {
    const index = readIndex(key);
    if (index.delete(canonicalId(id))) writeIndex(key, index);
  } catch { /* ignore */ }
}

// ─── "Added at" index ──────────────────────────────────────────────────────────
// Ratings and watchlist entries don't store when they were added, so the profile
// can't sort them newest-first on its own. We keep a single id→timestamp map
// here, populated from DB timestamps on login-sync and at the client add points.
const ADDED_AT_KEY = 'added-at-index';

// Record when an item was added. Pass an ISO string for known DB timestamps;
// omit it to stamp "now". A later call only overwrites with an EARLIER date, so
// the original add time wins over a re-sync that reports a newer updatedAt.
export function recordAddedAt(id: string, iso?: string): void {
  recordDates(ADDED_AT_KEY, [[id, iso]], 'earliest');
}

// Epoch millis for an item's add time, or 0 if unknown (sorts such items last).
export function getAddedAt(id: string): number {
  return dateOf(ADDED_AT_KEY, id) ?? 0;
}

// ─── "Watched at" index ────────────────────────────────────────────────────────
// The movie watch-log only holds movies and episodes, so shows marked watched (and
// any item synced down from the DB) have no local timestamp — they'd sort to 1970
// in watch history. This index gives every watched item a date. Unlike the add
// index, the LATEST timestamp wins, so re-watching bumps the item to the top.
const WATCHED_AT_KEY = 'watched-at-index';

// Record when an item was watched. Pass an ISO string for known DB timestamps;
// omit it to stamp "now". Latest wins, so a fresh watch pops to the top.
export function recordWatchedAt(id: string, iso?: string): void {
  recordDates(WATCHED_AT_KEY, [[id, iso]], 'latest');
}

// ISO string for when an item was watched, or null if unknown. Used as the date
// fallback in watch-history lists when there's no watch-log entry.
export function getWatchedAtISO(id: string): string | null {
  const t = dateOf(WATCHED_AT_KEY, id);
  return t === undefined ? null : new Date(t).toISOString();
}

// ─── "Rated at" index ─────────────────────────────────────────────────────────
// When a score was given, which is NOT when the title arrived.
//
// The ratings list used to read the add index for this, and printed it under the
// words "Rated on". Those are different questions and the add index cannot answer
// the second one: it keeps the EARLIEST date on purpose, so for anything
// watchlisted before it was rated — the normal path through the app — the add date
// always wins and the rating date is discarded. A film saved in July and scored in
// August read "Rated on 17 July" and sorted three weeks out of place.
//
// Latest wins here, like the watched index: re-scoring something is a fresh
// opinion and belongs at the top of "Date rated".
const RATED_AT_KEY = 'rated-at-index';

/** Record when a score was given. ISO string for a known DB timestamp, or omit
 *  for "now". */
export function recordRatedAt(id: string, iso?: string): void {
  recordDates(RATED_AT_KEY, [[id, iso]], 'latest');
}

export function removeRatedAt(id: string): void {
  forgetDate(RATED_AT_KEY, id);
}

// ─── Many dates at once ───────────────────────────────────────────────────────
// Each record*At call above reads a whole index, adds one date and writes it all
// back. Fine for a tap, but an import made one call per title and per episode:
// at 4,500 titles and 13,000 episodes those rewrites froze the page for minutes
// after everything had already saved. These take a batch — one read and one
// write per index — and keep the same rules as the single calls.
export function recordAddedAtMany(entries: DateEntry[]): void {
  recordDates(ADDED_AT_KEY, entries, 'earliest');
}

export function recordWatchedAtMany(entries: DateEntry[]): void {
  recordDates(WATCHED_AT_KEY, entries, 'latest');
}

export function recordRatedAtMany(entries: DateEntry[]): void {
  recordDates(RATED_AT_KEY, entries, 'latest');
}

/**
 * Epoch millis for when a score was given.
 *
 * Falls back to the add date for ratings made before this index existed — an
 * imperfect date beats sorting years of history to 1970. Every new rating, and
 * every rating that syncs down from the database, writes a real one.
 */
export function getRatedAt(id: string): number {
  return dateOf(RATED_AT_KEY, id) ?? getAddedAt(id);
}

// ─── "Manual watch" index ────────────────────────────────────────────────────
// Records titles the user marked watched IN THE APP (not via bulk import). A
// Letterboxd import dates films by their log-date, which can be "today" and
// would otherwise bury genuine taps in watch history. This index lets the
// history list put hand-marked titles in a tier ABOVE imports, regardless of
// the import's dates. Imports never write here — only the in-app watched action.
const MANUAL_WATCHED_KEY = 'manual-watched-index';

// Stamp an in-app watched action. Latest wins, so re-marking bumps it up within
// the manual tier.
export function recordManualWatch(id: string, iso?: string): void {
  recordDates(MANUAL_WATCHED_KEY, [[id, iso]], 'latest');
}

// Drop an item from the manual tier when the user un-marks it as watched.
export function removeManualWatch(id: string): void {
  forgetDate(MANUAL_WATCHED_KEY, id);
}

// ISO string for when the user hand-marked an item watched, or null if it was
// never marked in-app (e.g. import-only). Presence = "belongs in the top tier".
export function getManualWatchISO(id: string): string | null {
  const t = dateOf(MANUAL_WATCHED_KEY, id);
  return t === undefined ? null : new Date(t).toISOString();
}
