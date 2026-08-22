// How far through a show someone is, said the way people actually say it.
//
// "13 / 62" is true but throws away the interesting part: that they watched
// SEASON ONE. People talk in seasons, and ticking a season through is already how
// they get there, so the app should recognise it whether or not a mark-season
// button exists. When the watching doesn't line up with whole seasons — someone
// dipping in for a guest star, or halfway through season three — there's no season
// to name and the count is the honest answer.

export interface ShowProgress {
  /** What to show next to the eye: "62 / 62", "Season 1", "13 / 62", "1 episode". */
  label: string;
  watchedEpisodes: number;
  totalEpisodes: number;
  complete: boolean;
}

/** Episodes per season keyed by season number, as stored on FilmMeta. */
export type SeasonCounts = Record<string, number>;

/**
 * The season label, or null when there's no clean season story to tell.
 *
 * Only an unbroken run gets named — "Season 1", "Seasons 1–7". Watching seasons
 * 1, 3 and 5 isn't a story about seasons, it's a story about episodes, so it
 * falls back to the count. Listing them was worse than the number it replaced:
 * long lists truncate on a phone into "Seasons 1, 2, 4, 7…", which names some and
 * hides the rest, and even a short list is noise where a total would do.
 */
function formatSeasons(seasons: number[]): string | null {
  const sorted = [...seasons].sort((a, b) => a - b);
  if (sorted.length === 1) return `Season ${sorted[0]}`;
  const contiguous = sorted.every((s, i) => i === 0 || s === sorted[i - 1] + 1);
  if (!contiguous) return null;
  return `Seasons ${sorted[0]}–${sorted[sorted.length - 1]}`;
}

/**
 * @param watchedBySeason episodes watched per season number
 * @param seasonCounts    episodes each season has; undefined until backfilled
 * @param totalEpisodes   the show's episode total; 0 when unknown
 */
export function describeShowProgress(
  watchedBySeason: Map<number, number>,
  seasonCounts: SeasonCounts | undefined,
  totalEpisodes: number,
): ShowProgress {
  let watchedEpisodes = 0;
  for (const n of watchedBySeason.values()) watchedEpisodes += n;

  const complete = totalEpisodes > 0 && watchedEpisodes >= totalEpisodes;
  if (complete) {
    return { label: `${watchedEpisodes} / ${totalEpisodes}`, watchedEpisodes, totalEpisodes, complete: true };
  }

  // Name the seasons only when every one they've touched is finished. A season
  // they're partway through means there's nothing honest to name.
  if (seasonCounts && watchedBySeason.size > 0) {
    const seasons = [...watchedBySeason.keys()];
    const allWhole = seasons.every(s => {
      const total = seasonCounts[String(s)];
      return typeof total === 'number' && total > 0 && watchedBySeason.get(s)! >= total;
    });
    if (allWhole) {
      const label = formatSeasons(seasons);
      if (label) return { label, watchedEpisodes, totalEpisodes, complete: false };
      // Scattered seasons — no run to name, so fall through to the count.
    }
  }

  if (watchedEpisodes === 1) {
    return { label: '1 episode', watchedEpisodes, totalEpisodes, complete: false };
  }
  return {
    label: totalEpisodes > 0 ? `${watchedEpisodes} / ${totalEpisodes}` : `${watchedEpisodes} episodes`,
    watchedEpisodes,
    totalEpisodes,
    complete: false,
  };
}
