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
  original_language?: string;
}

function yearOf(r: TMDBResult, isTV: boolean): number {
  const d = isTV ? r.first_air_date : r.release_date;
  return d ? parseInt(d.slice(0, 4), 10) : 0;
}

function scoredMatch(results: TMDBResult[], inputYear: number | null, isTV: boolean): TMDBResult | null {
  if (results.length === 0) return null;
  if (!inputYear) return results[0];

  // Score each result: 2 = exact year, 1 = within 1 year, 0 = no match
  const scored = results.map(r => {
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

    const bestMovie = scoredMatch(movieResults, inputYear, false);
    const bestTV = scoredMatch(tvResults, inputYear, true);

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

    return ok({ tmdbId, mediaType, title, year: releaseYear, poster, language: top.original_language ?? '' });
  } catch {
    return err('Search failed', 502);
  }
}
