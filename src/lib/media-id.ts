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
