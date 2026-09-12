import { tmdbRequest } from './tmdb-fetch';

// Matching a line from someone's export file (Letterboxd, IMDb) to a TMDB title.
// Shared by /api/tmdb/search (one title at a time) and /api/import/match (a batch
// at a time, with a shared cache in front).

const BASE = 'https://api.themoviedb.org/3';

interface TMDBResult {
  id: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string;
  popularity?: number;
  vote_count?: number;
  vote_average?: number;
  original_language?: string;
}

export interface TitleMatch {
  tmdbId: string;
  mediaType: 'MOVIE' | 'SHOW';
  title: string;
  year: string;
  poster: string | null;
  language: string;
  rating?: number;
  /** Trust it without asking the person. False lands the title in "not sure". */
  confident: boolean;
}

/** How a TMDB URL is fetched — lets a batch route put a rate cap in front. */
export type TmdbFetcher = (url: string) => Promise<Response>;

export const defaultFetcher: TmdbFetcher = url => tmdbRequest(url, { next: { revalidate: 3600 } });

function yearOf(r: TMDBResult, isTV: boolean): number {
  const d = isTV ? r.first_air_date : r.release_date;
  return d ? parseInt(d.slice(0, 4), 10) : 0;
}

// Normalize a title for comparison: lowercase, strip accents/punctuation/articles
export function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\b(the|a|an)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[n];
}

// True if the TMDB title is close enough to the imported title to trust the match
function titleMatches(input: string, candidate: string): boolean {
  const a = normalizeTitle(input);
  const b = normalizeTitle(candidate);
  if (!a || !b) return false;
  if (a === b) return true;
  // Subtitle/edition differences ("Dune" ↔ "Dune: Part One")
  if (a.includes(b) || b.includes(a)) return true;
  const dist = levenshtein(a, b);
  return 1 - dist / Math.max(a.length, b.length) >= 0.82;
}

// 0..1 similarity between two titles (1 = identical after normalizing)
function titleSimilarity(input: string, candidate: string): number {
  const a = normalizeTitle(input);
  const b = normalizeTitle(candidate);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const dist = levenshtein(a, b);
  return 1 - dist / Math.max(a.length, b.length);
}

function scoredMatch(results: TMDBResult[], inputYear: number | null, isTV: boolean, query: string): TMDBResult | null {
  // Only trust results whose title actually resembles the imported title —
  // otherwise an unavailable film silently matches a popular unrelated one.
  const candidates = results.filter(r => titleMatches(query, (isTV ? r.name : r.title) ?? ''));
  if (candidates.length === 0) return null;
  if (!inputYear) return candidates[0];

  // Score each result: 2 = exact year, 1 = within 1 year, 0 = no match
  const scored = candidates.map(r => {
    const diff = Math.abs(yearOf(r, isTV) - inputYear);
    return { r, score: diff === 0 ? 2 : diff === 1 ? 1 : 0, pop: r.popularity ?? 0 };
  });

  // Sort: higher score first, then higher popularity
  scored.sort((a, b) => b.score - a.score || b.pop - a.pop);
  return scored[0].r;
}

function toMatch(top: TMDBResult, isTV: boolean, confident: boolean, fallbackTitle: string): TitleMatch {
  const title = (isTV ? top.name : top.title) ?? fallbackTitle;
  return {
    tmdbId: isTV ? `tmdb-tv-${top.id}` : `tmdb-${top.id}`,
    mediaType: isTV ? 'SHOW' : 'MOVIE',
    title,
    year: (isTV ? (top.first_air_date ?? '') : (top.release_date ?? '')).slice(0, 4),
    poster: top.poster_path ? `https://image.tmdb.org/t/p/w200${top.poster_path}` : null,
    language: top.original_language ?? '',
    rating: typeof top.vote_average === 'number' ? top.vote_average : undefined,
    confident,
  };
}

/**
 * The fuzzy search: a TMDB title search (movie, TV or both), best candidate by title
 * similarity, year and popularity. Throws when TMDB can't be reached, so a caller
 * can tell "no such title" (null) from "try again".
 */
export async function matchByTitle(
  q: string,
  year: string | null,
  typeHint: 'movie' | 'tv' | null,
  key: string,
  fetcher: TmdbFetcher = defaultFetcher,
): Promise<TitleMatch | null> {
  const inputYear = year ? parseInt(year, 10) : null;
  const wantMovie = typeHint !== 'tv';
  const wantTV = typeHint !== 'movie';

  const [movieRes, tvRes] = await Promise.all([
    wantMovie
      ? fetcher(`${BASE}/search/movie?api_key=${key}&query=${encodeURIComponent(q)}${year ? `&year=${year}` : ''}&include_adult=false`)
      : Promise.resolve(new Response('{"results":[]}', { status: 200 })),
    wantTV
      ? fetcher(`${BASE}/search/tv?api_key=${key}&query=${encodeURIComponent(q)}${year ? `&first_air_date_year=${year}` : ''}&include_adult=false`)
      : Promise.resolve(new Response('{"results":[]}', { status: 200 })),
  ]);
  // A search that errored is not a search that found nothing.
  if (!movieRes.ok && movieRes.status !== 404) throw new Error(`TMDB ${movieRes.status}`);
  if (!tvRes.ok && tvRes.status !== 404) throw new Error(`TMDB ${tvRes.status}`);

  const [movieData, tvData] = await Promise.all([
    movieRes.ok ? movieRes.json() : Promise.resolve({ results: [] }),
    tvRes.ok ? tvRes.json() : Promise.resolve({ results: [] }),
  ]);

  const movieResults: TMDBResult[] = (movieData.results ?? []).slice(0, 5);
  const tvResults: TMDBResult[] = (tvData.results ?? []).slice(0, 5);

  const bestMovie = scoredMatch(movieResults, inputYear, false, q);
  const bestTV = scoredMatch(tvResults, inputYear, true, q);

  if (!bestMovie && !bestTV) return null;

  let top: TMDBResult;
  let isTV: boolean;

  if (!bestMovie) { top = bestTV!; isTV = true; }
  else if (!bestTV) { top = bestMovie; isTV = false; }
  else {
    // Both candidates — pick by year closeness, then popularity
    const mDiff = inputYear ? Math.abs(yearOf(bestMovie, false) - inputYear) : 999;
    const tvDiff = inputYear ? Math.abs(yearOf(bestTV, true) - inputYear) : 999;
    if (tvDiff < mDiff) { top = bestTV; isTV = true; }
    else if (mDiff < tvDiff) { top = bestMovie; isTV = false; }
    else {
      // Same year distance — prefer higher popularity
      top = (bestTV.popularity ?? 0) > (bestMovie.popularity ?? 0) ? bestTV : bestMovie;
      isTV = top === bestTV;
    }
  }

  const title = (isTV ? top.name : top.title) ?? q;
  const sim = titleSimilarity(q, title);
  const yearGap = inputYear ? Math.abs(yearOf(top, isTV) - inputYear) : null;
  // Confident only when title is near-identical, year lines up, and the match
  // has enough votes to rule out obscure wrong films with the same name.
  const confident =
    sim >= 0.9 &&
    (yearGap === null || yearGap <= 1) &&
    (top.vote_count ?? 0) >= 20;

  return toMatch(top, isTV, confident, q);
}

/**
 * The exact lookup: an IMDb id (an IMDb export's Const column) straight to its TMDB
 * title, one request, no guessing. Null when TMDB has no film or series under that id
 * — an episode id is deliberately not a match, since episodes aren't imported as
 * titles. Throws when TMDB can't be reached.
 */
export async function matchByImdbId(
  imdbId: string,
  key: string,
  fetcher: TmdbFetcher = defaultFetcher,
): Promise<TitleMatch | null> {
  const res = await fetcher(`${BASE}/find/${imdbId}?api_key=${key}&language=en-US&external_source=imdb_id`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  const data = await res.json() as { movie_results?: TMDBResult[]; tv_results?: TMDBResult[] };
  const movie = data.movie_results?.[0];
  if (movie) return toMatch(movie, false, true, '');
  const tv = data.tv_results?.[0];
  if (tv) return toMatch(tv, true, true, '');
  return null;
}

/** The shared-cache key for a title search: normalized title | year | search type. */
export function titleKey(title: string, year: string | null | undefined, typeHint: 'movie' | 'tv' | null | undefined): string {
  return `title:${normalizeTitle(title)}|${year ?? ''}|${typeHint ?? 'any'}`;
}

/**
 * Spaces calls out to at most `perSecond`, however many are waiting. Each caller
 * awaits its own slot before it fires.
 */
export function createThrottle(perSecond: number): () => Promise<void> {
  const gap = 1000 / perSecond;
  let nextSlot = 0;
  return async () => {
    const now = Date.now();
    const slot = Math.max(now, nextSlot);
    nextSlot = slot + gap;
    if (slot > now) await new Promise(resolve => setTimeout(resolve, slot - now));
  };
}

/** Runs `fn` over every item, never more than `limit` at once; results keep input order. */
export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
