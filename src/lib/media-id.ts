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

// ─── "Added at" index ──────────────────────────────────────────────────────────
// Ratings and watchlist entries don't store when they were added, so the profile
// can't sort them newest-first on its own. We keep a single id→ISO-timestamp map
// here, populated from DB timestamps on login-sync and at the client add points.
const ADDED_AT_KEY = 'added-at-index';

function readAddedAtMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(ADDED_AT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
}

// Record when an item was added. Pass an ISO string for known DB timestamps;
// omit it to stamp "now". A later call only overwrites with an EARLIER date, so
// the original add time wins over a re-sync that reports a newer updatedAt.
export function recordAddedAt(id: string, iso?: string): void {
  try {
    let next = iso ?? new Date().toISOString();
    if (Number.isNaN(new Date(next).getTime())) next = new Date().toISOString();
    const map = readAddedAtMap();
    const cid = canonicalId(id);
    const existing = map[cid];
    if (!existing || new Date(next).getTime() < new Date(existing).getTime()) {
      map[cid] = next;
      localStorage.setItem(ADDED_AT_KEY, JSON.stringify(map));
    }
  } catch { /* ignore */ }
}

// Epoch millis for an item's add time, or 0 if unknown (sorts such items last).
export function getAddedAt(id: string): number {
  const iso = readAddedAtMap()[canonicalId(id)];
  const t = iso ? new Date(iso).getTime() : 0;
  return Number.isNaN(t) ? 0 : t;
}

// ─── "Watched at" index ────────────────────────────────────────────────────────
// The movie watch-log only holds movies and episodes, so shows marked watched (and
// any item synced down from the DB) have no local timestamp — they'd sort to 1970
// in watch history. This index gives every watched item a date. Unlike the add
// index, the LATEST timestamp wins, so re-watching bumps the item to the top.
const WATCHED_AT_KEY = 'watched-at-index';

function readWatchedAtMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(WATCHED_AT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
}

// Record when an item was watched. Pass an ISO string for known DB timestamps;
// omit it to stamp "now". Latest wins, so a fresh watch pops to the top.
export function recordWatchedAt(id: string, iso?: string): void {
  try {
    let next = iso ?? new Date().toISOString();
    if (Number.isNaN(new Date(next).getTime())) next = new Date().toISOString();
    const map = readWatchedAtMap();
    const cid = canonicalId(id);
    const existing = map[cid];
    if (!existing || new Date(next).getTime() > new Date(existing).getTime()) {
      map[cid] = next;
      localStorage.setItem(WATCHED_AT_KEY, JSON.stringify(map));
    }
  } catch { /* ignore */ }
}

// ISO string for when an item was watched, or null if unknown. Used as the date
// fallback in watch-history lists when there's no watch-log entry.
export function getWatchedAtISO(id: string): string | null {
  return readWatchedAtMap()[canonicalId(id)] ?? null;
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

function readRatedAtMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(RATED_AT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
}

/** Record when a score was given. ISO string for a known DB timestamp, or omit
 *  for "now". */
export function recordRatedAt(id: string, iso?: string): void {
  try {
    let next = iso ?? new Date().toISOString();
    if (Number.isNaN(new Date(next).getTime())) next = new Date().toISOString();
    const map = readRatedAtMap();
    const cid = canonicalId(id);
    const existing = map[cid];
    if (!existing || new Date(next).getTime() > new Date(existing).getTime()) {
      map[cid] = next;
      localStorage.setItem(RATED_AT_KEY, JSON.stringify(map));
    }
  } catch { /* ignore */ }
}

export function removeRatedAt(id: string): void {
  try {
    const map = readRatedAtMap();
    delete map[canonicalId(id)];
    localStorage.setItem(RATED_AT_KEY, JSON.stringify(map));
  } catch { /* ignore */ }
}

/**
 * Epoch millis for when a score was given.
 *
 * Falls back to the add date for ratings made before this index existed — an
 * imperfect date beats sorting years of history to 1970. Every new rating, and
 * every rating that syncs down from the database, writes a real one.
 */
export function getRatedAt(id: string): number {
  const iso = readRatedAtMap()[canonicalId(id)];
  if (iso) {
    const t = new Date(iso).getTime();
    if (!Number.isNaN(t)) return t;
  }
  return getAddedAt(id);
}

// ─── "Manual watch" index ────────────────────────────────────────────────────
// Records titles the user marked watched IN THE APP (not via bulk import). A
// Letterboxd import dates films by their log-date, which can be "today" and
// would otherwise bury genuine taps in watch history. This index lets the
// history list put hand-marked titles in a tier ABOVE imports, regardless of
// the import's dates. Imports never write here — only the in-app watched action.
const MANUAL_WATCHED_KEY = 'manual-watched-index';

function readManualWatchMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(MANUAL_WATCHED_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
}

// Stamp an in-app watched action. Latest wins, so re-marking bumps it up within
// the manual tier.
export function recordManualWatch(id: string, iso?: string): void {
  try {
    let next = iso ?? new Date().toISOString();
    if (Number.isNaN(new Date(next).getTime())) next = new Date().toISOString();
    const map = readManualWatchMap();
    const cid = canonicalId(id);
    const existing = map[cid];
    if (!existing || new Date(next).getTime() > new Date(existing).getTime()) {
      map[cid] = next;
      localStorage.setItem(MANUAL_WATCHED_KEY, JSON.stringify(map));
    }
  } catch { /* ignore */ }
}

// Drop an item from the manual tier when the user un-marks it as watched.
export function removeManualWatch(id: string): void {
  try {
    const map = readManualWatchMap();
    const cid = canonicalId(id);
    if (cid in map) {
      delete map[cid];
      localStorage.setItem(MANUAL_WATCHED_KEY, JSON.stringify(map));
    }
  } catch { /* ignore */ }
}

// ISO string for when the user hand-marked an item watched, or null if it was
// never marked in-app (e.g. import-only). Presence = "belongs in the top tier".
export function getManualWatchISO(id: string): string | null {
  return readManualWatchMap()[canonicalId(id)] ?? null;
}
