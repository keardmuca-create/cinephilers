// Collapse a flat list of ratings into one row per title.
//
// Most people rate a show; some rate every episode. Both have to work, and 62
// episode ratings must not become 62 rows — that is the burial problem the watch
// history collapse exists to fix, and it applies here too.
//
// The rule that keeps it honest: a series rating and an episode average are NEVER
// merged. The series rating is what the user actually said about the show. The
// average is arithmetic done on their behalf, so it is always reported separately
// and labelled, never passed off as their opinion of the series.

const EP_ID = /^(.*)-S\d+E\d+$/;

export interface RatingInput {
  id: string;
  score: number;
}

export interface CollapsedRating {
  /** The show's id for a collapsed show, otherwise the film's own id. */
  id: string;
  isShow: boolean;
  /** What the user gave the series itself. Undefined if they never rated it. */
  seriesRating?: number;
  /** How many episodes of this show they rated. 0 for films. */
  episodeCount: number;
  /** Mean of those episode ratings, 1dp. Undefined when no episodes were rated. */
  episodeAverage?: number;
  /** Every rating id folded into this row. */
  memberIds: string[];
}

/** The parent show id for an episode rating, or null if this isn't one. */
export function parentShowId(id: string): string | null {
  const m = EP_ID.exec(id);
  return m ? m[1] : null;
}

/**
 * What a rating is actually for, from the shape of its id.
 *
 * Every rating is stored under the same `movie-rating-` prefix whatever it's for,
 * so anything counting by key prefix cannot tell them apart — which is exactly how
 * the badge counters came to read every rating as a film and every rated episode
 * as another show rated.
 */
export function ratingKind(id: string): 'film' | 'show' | 'episode' {
  if (EP_ID.test(id)) return 'episode';
  return id.startsWith('tmdb-tv-') ? 'show' : 'film';
}

/**
 * The number a show row sorts and filters by: what the user said about the
 * series if they said anything, otherwise their episode average. Without the
 * fallback, someone who only rates episodes has every show sort as unrated.
 */
export function effectiveScore(row: CollapsedRating): number | undefined {
  return row.seriesRating ?? row.episodeAverage;
}

export function collapseRatings(entries: RatingInput[]): CollapsedRating[] {
  const rows = new Map<string, CollapsedRating>();
  const episodeScores = new Map<string, number[]>();

  for (const entry of entries) {
    const showId = parentShowId(entry.id);
    const key = showId ?? entry.id;
    // A bare tmdb-tv- id is a rating of the series; anything else is a film.
    const isShow = showId !== null || entry.id.startsWith('tmdb-tv-');

    let row = rows.get(key);
    if (!row) {
      row = { id: key, isShow, episodeCount: 0, memberIds: [] };
      rows.set(key, row);
    }
    // A show can arrive as episodes first and its own rating later, or the
    // reverse — so promote to a show row whenever either form turns up.
    if (isShow) row.isShow = true;
    row.memberIds.push(entry.id);

    if (showId) {
      const scores = episodeScores.get(key) ?? [];
      scores.push(entry.score);
      episodeScores.set(key, scores);
    } else {
      row.seriesRating = entry.score;
    }
  }

  for (const [key, scores] of episodeScores) {
    const row = rows.get(key)!;
    row.episodeCount = scores.length;
    row.episodeAverage = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
  }

  return [...rows.values()];
}
