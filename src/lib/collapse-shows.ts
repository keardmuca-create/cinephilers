// Collapse a flat watch list into one row per title.
//
// Watch History used to list every episode separately, so finishing a series
// buried everything else under sixty-two rows of the same poster. A show is one
// thing you're working through, not sixty-two things you did — so its episodes
// fold into a single row carrying progress, ordered by the most recent episode
// watched. Films are untouched: watched once, on one day, never moving.
//
// Shared by the history page, the profile shelf and public profiles so all three
// group identically.

export interface CollapseInput {
  id: string;
  /** Parent show id for an episode entry; undefined for films and shows. */
  showId?: string;
  isEpisode?: boolean;
  /** Total episodes in the parent show, when known (FilmMeta.episodeCount). */
  totalEpisodes?: number;
  /** "Ended" / "Returning Series" — decides Completed vs Up to date. */
  showStatus?: string;
  /** ISO date this entry was watched/logged. */
  watchedAt: string;
}

export type ShowProgressStatus = 'completed' | 'up-to-date' | 'watching';

export interface CollapsedRow {
  /** The show's id for a collapsed show, otherwise the film's own id. */
  id: string;
  isShow: boolean;
  /** Episodes of this show present in the list. 0 for films. */
  watchedEpisodes: number;
  /** Total episodes, when known. 0 when we can't say. */
  totalEpisodes: number;
  status: ShowProgressStatus | null;
  /** "Ended" / "Returning Series", from whichever entry carried it. */
  showStatus?: string;
  /** Most recent episode date for a show; the film's own date otherwise. */
  watchedAt: string;
  /**
   * Every entry id folded into this row — the episode ids for a show, or just
   * the film's own id. The callers need them to delete a whole show at once and
   * to tell a hand-marked row from an imported one.
   */
  memberIds: string[];
}

const EP_ID = /^(.*)-S\d+E\d+$/;

/** The parent show id for an episode entry, or null if this isn't an episode. */
export function parentShowId(entry: CollapseInput): string | null {
  if (entry.showId) return entry.showId;
  if (entry.isEpisode) {
    const m = EP_ID.exec(entry.id);
    if (m) return m[1];
  }
  // Fall back to the id shape: meta may not have loaded yet, but an id ending
  // in -S1E2 is an episode regardless.
  const m = EP_ID.exec(entry.id);
  return m ? m[1] : null;
}

/**
 * Completed / Up to date / still watching, from a count against a total. Exported
 * because the profile shelf resolves its totals after collapsing (it slices to a
 * preview before fetching meta) and must land on the same answer as the list.
 */
export function statusFor(watched: number, total: number, showStatus?: string): ShowProgressStatus {
  if (total > 0 && watched >= total) {
    // A finished series you've finished is Completed; a running one is merely
    // up to date, because more is coming.
    return (showStatus ?? '').toLowerCase() === 'ended' ? 'completed' : 'up-to-date';
  }
  return 'watching';
}

export function collapseShows(entries: CollapseInput[]): CollapsedRow[] {
  const rows = new Map<string, CollapsedRow>();

  // A note on the episode total, since two kinds of entry carry one. The show's
  // own entry and each of its episodes both know how many episodes the show has,
  // but only the show's is kept up to date: episode entries never expire, because
  // re-checking one costs the server a lookup of the parent show anyway, and a
  // library holds far more episodes than shows. So the show's number wins wherever
  // both exist — otherwise a show whose episodes were cached a year ago would go
  // on insisting it has 63 episodes long after the 64th aired.
  for (const entry of entries) {
    const showId = parentShowId(entry);
    const key = showId ?? entry.id;
    const isShowRow = showId !== null || entry.totalEpisodes !== undefined;
    // The show's own entry: not an episode of something, but carrying a total.
    const isShowsOwnEntry = showId === null && entry.totalEpisodes !== undefined;

    const existing = rows.get(key);
    if (!existing) {
      rows.set(key, {
        id: key,
        isShow: isShowRow,
        watchedEpisodes: showId ? 1 : 0,
        totalEpisodes: entry.totalEpisodes ?? 0,
        status: null,
        showStatus: entry.showStatus,
        watchedAt: entry.watchedAt,
        memberIds: [entry.id],
      });
      continue;
    }

    // Merge: a show can arrive as its own entry AND as episodes. Count episodes
    // only, keep the newest date, and settle the total as described above.
    existing.memberIds.push(entry.id);
    if (showId) existing.watchedEpisodes += 1;
    if (isShowRow) existing.isShow = true;
    if (entry.totalEpisodes) {
      if (isShowsOwnEntry) {
        // The show's own number, and it overwrites whatever an episode said.
        existing.totalEpisodes = entry.totalEpisodes;
      } else if (!existing.totalEpisodes) {
        // An episode's number only fills a gap — the show may not be cached yet.
        existing.totalEpisodes = entry.totalEpisodes;
      }
    }
    // Only one entry of a show usually carries these, and it isn't always the
    // first one seen — so take whichever turns up rather than overwriting.
    if (!existing.showStatus && entry.showStatus) existing.showStatus = entry.showStatus;
    if (entry.watchedAt > existing.watchedAt) existing.watchedAt = entry.watchedAt;
  }

  // Resolve status once per row, now that every episode has been counted.
  for (const row of rows.values()) {
    if (!row.isShow) continue;
    row.status = statusFor(row.watchedEpisodes, row.totalEpisodes, row.showStatus);
  }

  return [...rows.values()].sort((a, b) => b.watchedAt.localeCompare(a.watchedAt));
}
