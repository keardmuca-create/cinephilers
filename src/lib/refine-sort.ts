import type { RefineValue } from '@/components/refine-sheet';

// Read a saved refine — the sessionStorage entry each full-page list writes when
// the user taps "Refine" (keys: watchlist-refine / history-refine / ratings-refine
// / list-refine). Returns null when nothing is saved or it's malformed.
export function readSavedRefine(key: string): RefineValue | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (v && typeof v.sortField === 'string' && typeof v.sortDir === 'string') return v as RefineValue;
  } catch { /* ignore */ }
  return null;
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
