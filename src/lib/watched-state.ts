// What the eye on a card is allowed to say about a title.
//
// Films are simple: watched or not. Shows aren't — a show has no watched record
// of its own (the episodes ARE the record), so "have I seen this" has three
// honest answers, not two. Someone who watched one episode for a guest star and
// someone who finished seven seasons are both "not none", and a card that treats
// them the same as an untouched show is lying to you either way.
//
// Everything here is read synchronously from localStorage, on purpose. Whether
// you've started a show is already on the device, so the eye is correct on first
// paint and never changes under you a moment later.

export type WatchedState = 'none' | 'partial' | 'complete';

/** Shows are the only thing that can be partially watched. */
function isShowId(id: string): boolean {
  return /^tmdb-tv-\d+$/.test(id);
}

/**
 * The show's episode total, if we happen to already know it.
 *
 * Ticking a show through the Mark-watched button writes `show-status`, so that
 * path never needs this. But someone who watched it episode by episode has no
 * such flag — only a list of episodes — and the only way to know that list is
 * the whole show is to compare it against the total. The meta cache usually has
 * it; when it doesn't, we say "partial" rather than fetch, because an eye that
 * arrives late is worse than an eye that undersells by one episode.
 */
function cachedEpisodeTotal(id: string): number | null {
  try {
    const raw = localStorage.getItem(`meta-${id}`);
    if (!raw) return null;
    const total = (JSON.parse(raw) as { totalEps?: number }).totalEps;
    return typeof total === 'number' && total > 0 ? total : null;
  } catch {
    return null;
  }
}

/** Episodes ticked off for a show, or null if it isn't a part-watched show. */
function watchedEpisodeCount(id: string): number | null {
  try {
    if (readWatchedState(id) !== 'partial') return null;
    const raw = localStorage.getItem(`watched-eps-index-${id}`);
    if (!raw) return null;
    const index = JSON.parse(raw) as unknown;
    return Array.isArray(index) && index.length > 0 ? index.length : null;
  } catch {
    return null;
  }
}

/**
 * How far into a show someone is, for the surfaces with room to say it: "3 / 67".
 *
 * Deliberately a count and not "Watching": someone who watched one episode for a
 * guest star isn't watching the show, and never will be. The number is true
 * whether they carry on or not.
 *
 * Always a fraction, never a bare count — "1 episode" sitting in a column of
 * "3 / 73"s reads as a different kind of fact. Null when we can't say it that
 * way yet; loadEpisodeProgress() is how the caller gets the missing half.
 */
export function readEpisodeProgress(id: string): string | null {
  const watched = watchedEpisodeCount(id);
  if (watched === null) return null;
  const total = cachedEpisodeTotal(id);
  return total !== null ? `${watched} / ${total}` : null;
}

/**
 * The same label, fetching the show's episode total when it isn't cached.
 *
 * The eye never waits on this — it's already correct from localStorage. Only the
 * number does, and the request is coalesced with every other meta lookup on the
 * page, so a list of part-watched shows costs one call between them.
 */
export async function loadEpisodeProgress(id: string): Promise<string | null> {
  const watched = watchedEpisodeCount(id);
  if (watched === null) return null;

  const cached = cachedEpisodeTotal(id);
  if (cached !== null) return `${watched} / ${cached}`;

  const { batchFetchMeta } = await import('./meta-batch');
  const meta = await batchFetchMeta([id]);
  const total = meta[id]?.totalEps;
  return typeof total === 'number' && total > 0 ? `${watched} / ${total}` : null;
}

export function readWatchedState(id: string): WatchedState {
  try {
    // Films, and anything imported as a flat watch.
    if (localStorage.getItem(`watched-${id}`) === 'true') return 'complete';
    if (!isShowId(id)) return 'none';

    if (localStorage.getItem(`show-status-${id}`) === 'completed') return 'complete';

    const raw = localStorage.getItem(`watched-eps-index-${id}`);
    if (!raw) return 'none';
    const index = JSON.parse(raw) as unknown;
    if (!Array.isArray(index) || index.length === 0) return 'none';

    const total = cachedEpisodeTotal(id);
    if (total !== null && index.length >= total) return 'complete';
    return 'partial';
  } catch {
    return 'none';
  }
}
