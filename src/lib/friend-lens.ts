// The chip logic behind a title's Friends page, kept out of the component so it
// can be tested. The page itself needs a signed-in session and a following list,
// which makes the rules underneath it the one part that can be checked directly.

/** Which slice of the list is on screen. Null shows all of them. */
export type Lens = null | 'watched' | 'rated' | 'reviewed' | 'watchlist';

export interface FriendSignal {
  watched: boolean;
  rating: number | null;
  reviewed: boolean;
  inWatchlist: boolean;
  /** Shows only: "62 / 62", "Season 1", "13 / 62". */
  progress?: string;
}

/**
 * Did this friend watch it?
 *
 * A score or a review is proof they watched it whether or not the watched flag
 * was ever written — rating a film sets it, but an import or an early bug may
 * not have. The eye in each row already reads it this way, and a count that
 * disagreed with the icons beside it would be the more confusing of the two.
 */
export function hasWatched(e: FriendSignal): boolean {
  return e.watched || e.rating !== null || e.reviewed || !!e.progress;
}

export function matchesLens(e: FriendSignal, lens: Lens): boolean {
  switch (lens) {
    case 'watched': return hasWatched(e);
    case 'rated': return e.rating !== null;
    case 'reviewed': return e.reviewed;
    case 'watchlist': return e.inWatchlist;
    default: return true;
  }
}

/**
 * The chip numbers.
 *
 * These deliberately do not sum to `all`: one friend who watched, scored and
 * reviewed a film is inside three of them at once. That is why the page shows
 * the total as its own chip rather than as the first of five numbers in a row —
 * a row invites adding them up, and the sum would look like a bug.
 */
export function lensCounts(entries: FriendSignal[]) {
  return {
    all: entries.length,
    watched: entries.filter(hasWatched).length,
    rated: entries.filter(e => e.rating !== null).length,
    reviewed: entries.filter(e => e.reviewed).length,
    watchlist: entries.filter(e => e.inWatchlist).length,
  };
}

/**
 * Most to say first: reviewed, then rated, then watched, then watchlisted.
 *
 * Without it, eighty-three friends arrive in whatever order the queries returned
 * them and the one who actually wrote something sits wherever chance put her.
 */
export function lensRank(e: FriendSignal): number {
  if (e.reviewed) return 0;
  if (e.rating !== null) return 1;
  if (e.watched || e.progress) return 2;
  return 3;
}
