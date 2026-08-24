// Minimum number of user ratings a title needs before its Cinephilers score is
// shown in place of the TMDB rating. Low on purpose for launch so popular
// titles flip to the community score quickly — raise it as the community grows.
export const MIN_CINEPHILERS_RATINGS = 5;

export interface CinephilersRating {
  count: number;
  average: number | null;
  hasEnough: boolean;
}

/**
 * The one number a title should show, and which score it came from.
 *
 * The rule used to live only on the film page, so a title that had crossed the
 * threshold showed its community score there and its TMDB score in every list
 * that mentioned it. One title, two numbers, depending on where you happened to
 * be looking. This is that rule in one place so every surface can apply it.
 *
 * Returns null when there is nothing worth showing — no community score and no
 * TMDB score — so callers can leave the star off entirely rather than print a 0.
 */
export function resolveDisplayRating(
  tmdbRating: number | null | undefined,
  cine: { average: number | null; hasEnough: boolean } | null | undefined,
): { value: number; source: 'cinephilers' | 'tmdb' } | null {
  if (cine?.hasEnough && typeof cine.average === 'number' && cine.average > 0) {
    return { value: cine.average, source: 'cinephilers' };
  }
  if (typeof tmdbRating === 'number' && tmdbRating > 0) {
    return { value: tmdbRating, source: 'tmdb' };
  }
  return null;
}
