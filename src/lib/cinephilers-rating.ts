// Minimum number of user ratings a title needs before its Cinephilers score is
// shown in place of the TMDB rating. Low on purpose for launch so popular
// titles flip to the community score quickly — raise it as the community grows.
export const MIN_CINEPHILERS_RATINGS = 5;

export interface CinephilersRating {
  count: number;
  average: number | null;
  hasEnough: boolean;
}
