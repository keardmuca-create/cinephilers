import { NextRequest } from 'next/server';
import { ok, err } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

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

function yearOf(r: TMDBResult, isTV: boolean): number {
  const d = isTV ? r.first_air_date : r.release_date;
  return d ? parseInt(d.slice(0, 4), 10) : 0;
}

// Normalize a title for comparison: lowercase, strip accents/punctuation/articles
function normalizeTitle(s: string): string {
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

export async function GET(req: NextRequest) {
  const key = process.env.TMDB_API_KEY;
  if (!key) return err('TMDB key not configured', 500);

  const q = req.nextUrl.searchParams.get('q')?.trim();
  const year = req.nextUrl.searchParams.get('year')?.trim();
  const typeHint = req.nextUrl.searchParams.get('type')?.trim(); // 'movie' | 'tv' | null
  if (!q) return err('Missing query');

  const inputYear = year ? parseInt(year, 10) : null;
  const wantMovie = typeHint !== 'tv';
  const wantTV = typeHint !== 'movie';

  try {
    const [movieRes, tvRes] = await Promise.all([
      wantMovie
        ? fetch(
            `${BASE}/search/movie?api_key=${key}&query=${encodeURIComponent(q)}${year ? `&year=${year}` : ''}&include_adult=false`,
            { next: { revalidate: 3600 } }
          )
        : Promise.resolve(new Response('{"results":[]}', { status: 200 })),
      wantTV
        ? fetch(
            `${BASE}/search/tv?api_key=${key}&query=${encodeURIComponent(q)}${year ? `&first_air_date_year=${year}` : ''}&include_adult=false`,
            { next: { revalidate: 3600 } }
          )
        : Promise.resolve(new Response('{"results":[]}', { status: 200 })),
    ]);

    const [movieData, tvData] = await Promise.all([
      movieRes.ok ? movieRes.json() : Promise.resolve({ results: [] }),
      tvRes.ok ? tvRes.json() : Promise.resolve({ results: [] }),
    ]);

    const movieResults: TMDBResult[] = (movieData.results ?? []).slice(0, 5);
    const tvResults: TMDBResult[] = (tvData.results ?? []).slice(0, 5);

    const bestMovie = scoredMatch(movieResults, inputYear, false, q);
    const bestTV = scoredMatch(tvResults, inputYear, true, q);

    if (!bestMovie && !bestTV) return ok(null);

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

    const tmdbId = isTV ? `tmdb-tv-${top.id}` : String(top.id);
    const mediaType = isTV ? 'SHOW' : 'MOVIE';
    const title = (isTV ? top.name : top.title) ?? q;
    const releaseYear = (isTV ? (top.first_air_date ?? '') : (top.release_date ?? '')).slice(0, 4);
    const poster = top.poster_path ? `https://image.tmdb.org/t/p/w200${top.poster_path}` : null;

    // Confident only when the title is (near-)identical AND the year lines up.
    // Loose matches (subtitle/substring) or year gaps ≥ 2 are flagged for manual review
    // so we don't silently import the wrong film.
    const sim = titleSimilarity(q, title);
    const yearGap = inputYear ? Math.abs(yearOf(top, isTV) - inputYear) : null;
    const confident = sim >= 0.9 && (yearGap === null || yearGap <= 1);

    return ok({ tmdbId, mediaType, title, year: releaseYear, poster, language: top.original_language ?? '', rating: typeof top.vote_average === 'number' ? top.vote_average : undefined, confident });
  } catch {
    return err('Search failed', 502);
  }
}
