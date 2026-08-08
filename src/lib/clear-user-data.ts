// Wipes every piece of per-user state from localStorage.
// Used on logout and on account switch (login as a different user in the same
// browser) so one account's watched/activity/list data can never bleed into
// another account's session — the root cause of the phantom-watch leak.
export function clearUserData() {
  if (typeof window === 'undefined') return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      // Keep the saved Refine sort preferences (watchlist-refine / history-refine /
      // ratings-refine / list-refine) across logout and account switch — they're
      // device-level UI prefs, not user data. Without this, "watchlist-refine" would
      // be wiped by the "watchlist-" prefix rule below, resetting the sort on login.
      // Same for the chosen Movies/Shows side (watchlist-side would otherwise be
      // wiped by the "watchlist-" rule below while history-side survived).
      if (k.endsWith('-refine') || k.endsWith('-side')) continue;
      if (
        k === 'cinephilers_user' ||
        k === 'recently-viewed' ||
        k === 'watch-log' ||
        k === 'media-id-normalized-v1' ||
        k === 'added-at-index' ||
        k === 'watched-at-index' ||
        k === 'rated-at-index' ||
        k === 'manual-watched-index' ||
        k === 'user-favorites' ||
        k === 'user-lists' ||
        k === 'activity-feed' ||
        k === 'activity-dismissed' ||
        k.startsWith('movie-rating-') ||
        k.startsWith('watchlist-') ||
        k.startsWith('watched-') ||
        k.startsWith('meta-') ||
        k.startsWith('review-') ||
        k.startsWith('show-status-')
      ) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  } catch { /* ignore */ }
}
