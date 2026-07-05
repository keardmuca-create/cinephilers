import type { RefineValue } from '@/components/refine-sheet';

// Read a saved refine — the localStorage entry each full-page list writes when
// the user taps "Refine" (keys: watchlist-refine / history-refine / ratings-refine
// / list-refine). localStorage (not sessionStorage) so the chosen order survives
// leaving and reopening the app. Returns null when nothing is saved or malformed.
export function readSavedRefine(key: string): RefineValue | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (v && typeof v.sortField === 'string' && typeof v.sortDir === 'string') return v as RefineValue;
  } catch { /* ignore */ }
  return null;
}

// The four localStorage keys that hold list sort preferences, mapped to the
// short names stored server-side in User.listPrefs.
export const REFINE_KEYS: Record<string, string> = {
  history: 'history-refine',
  ratings: 'ratings-refine',
  watchlist: 'watchlist-refine',
  list: 'list-refine',
  rewatched: 'rewatched-refine',
};

// Save a refine and sync ALL current refines to the account, so the chosen
// sort survives a browser-data clear and follows the user across devices.
// The server stores the whole set (last write wins), so we always send every
// key we have locally — no read-modify-write race on the server.
export function persistRefine(lsKey: string, value: RefineValue): void {
  try { localStorage.setItem(lsKey, JSON.stringify(value)); } catch { /* ignore */ }
  try {
    const prefs: Record<string, RefineValue> = {};
    for (const [name, key] of Object.entries(REFINE_KEYS)) {
      const v = readSavedRefine(key);
      if (v) prefs[name] = v;
    }
    // Fire-and-forget — the local write already took effect; server is backup.
    fetch('/api/users/me/prefs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ listPrefs: prefs }),
    }).catch(() => { /* ignore */ });
  } catch { /* ignore */ }
}

// Write account-stored refine prefs into localStorage on login (server is the
// source of truth after a browser-data clear or on a fresh device). Only fills
// keys the server actually has, so it never clobbers a device-local sort with
// nothing.
export function applyServerRefinePrefs(prefs: unknown): void {
  if (!prefs || typeof prefs !== 'object') return;
  try {
    for (const [name, key] of Object.entries(REFINE_KEYS)) {
      const v = (prefs as Record<string, unknown>)[name];
      if (v && typeof v === 'object' && typeof (v as RefineValue).sortField === 'string') {
        localStorage.setItem(key, JSON.stringify(v));
      }
    }
  } catch { /* ignore */ }
}

// Full release timestamp: prefer the cached meta's full date so same-year titles
// order identically to the full page; fall back to Jan 1 of the year.
function releaseTs(id: string, year?: string): number | null {
  let releaseDate = '';
  try {
    const cached = typeof localStorage !== 'undefined' ? localStorage.getItem(`meta-${id}`) : null;
    if (cached) {
      const m = JSON.parse(cached);
      if (typeof m.releaseDate === 'string') releaseDate = m.releaseDate;
    }
  } catch { /* ignore */ }
  const raw = releaseDate || (year && /^\d{4}$/.test(year) ? `${year}-01-01` : '');
  const t = raw ? Date.parse(raw) : NaN;
  return Number.isNaN(t) ? null : t;
}

interface Sortable { id: string; title: string; year?: string; userRating?: number }

// Reorder a profile-preview list to match the refine the user set on the full page.
// SORT ONLY — Type/Genre filters are intentionally ignored so the preview keeps
// showing every item and the section's header count stays accurate.
//
// The incoming array is assumed to already be in the section's primary-date order
// (newest first — date added / watched / rated), so the primary-date branch just
// keeps it (desc) or reverses it (asc) rather than re-deriving each section's date.
export function applyRefineSort<T extends Sortable>(items: T[], refine: RefineValue | null): T[] {
  if (!refine) return items;
  const arr = [...items];
  const { sortField, sortDir } = refine;

  if (sortField === 'title') {
    arr.sort((a, b) => a.title.localeCompare(b.title));
    if (sortDir === 'desc') arr.reverse();
  } else if (sortField === 'release') {
    const dir = sortDir === 'desc' ? -1 : 1;
    arr.sort((a, b) => {
      const ta = releaseTs(a.id, a.year), tb = releaseTs(b.id, b.year);
      if (ta === null && tb === null) return 0;
      if (ta === null) return 1;   // unknown date always sinks to the bottom
      if (tb === null) return -1;
      return (ta - tb) * dir;
    });
  } else if (sortField === 'rating') {
    arr.sort((a, b) => (b.userRating ?? 0) - (a.userRating ?? 0));
    if (sortDir === 'asc') arr.reverse();
  } else {
    // Primary date field (recent / date / added) — already newest-first.
    if (sortDir === 'asc') arr.reverse();
  }
  return arr;
}
