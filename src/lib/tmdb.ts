
import { Movie, Actor, Review } from './mock-data';

const BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE = 'https://image.tmdb.org/t/p';

function apiKey() {
  return process.env.TMDB_API_KEY ?? '';
}

function posterUrl(path: string | null, size = 'w500'): string {
  if (!path) return `https://picsum.photos/seed/noposter/400/600`;
  return `${IMAGE_BASE}/${size}${path}`;
}

function backdropUrl(path: string | null, size = 'w1280'): string {
  if (!path) return `https://picsum.photos/seed/nobackdrop/1200/600`;
  return `${IMAGE_BASE}/${size}${path}`;
}

// Raw TMDB shapes (minimal — only fields we use)
interface TmdbMovie {
  id: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  genre_ids?: number[];
  genres?: { id: number; name: string }[];
  overview: string;
  vote_average: number;
  vote_count: number;
  poster_path: string | null;
  backdrop_path: string | null;
  media_type?: 'movie' | 'tv';
}

interface TmdbCredits {
  cast: { id: number; name: string; character: string; profile_path: string | null }[];
  crew: { id: number; name: string; job: string }[];
}

// Genre id → name map (covers most common genres)
const GENRE_MAP: Record<number, string> = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy',
  80: 'Crime', 99: 'Documentary', 18: 'Drama', 10751: 'Family',
  14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music',
  9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi', 10770: 'TV Movie',
  53: 'Thriller', 10752: 'War', 37: 'Western',
  10759: 'Action & Adventure', 10762: 'Kids', 10763: 'News',
  10764: 'Reality', 10765: 'Sci-Fi & Fantasy', 10766: 'Soap',
  10767: 'Talk', 10768: 'War & Politics',
};

function genreLabel(movie: TmdbMovie): string {
  if (movie.genres && movie.genres.length > 0) {
    return movie.genres.slice(0, 2).map(g => g.name).join(' ');
  }
  if (movie.genre_ids && movie.genre_ids.length > 0) {
    return (movie.genre_ids.slice(0, 2).map(id => GENRE_MAP[id]).filter(Boolean)).join(' ') || 'Unknown';
  }
  return 'Unknown';
}

export function tmdbToMovie(raw: TmdbMovie, credits?: TmdbCredits): Movie {
  const isShow = raw.media_type === 'tv' || (!raw.title && !!raw.name);
  const title = raw.title ?? raw.name ?? 'Untitled';
  const releaseDate = raw.release_date ?? raw.first_air_date ?? '';
  const year = releaseDate ? releaseDate.slice(0, 4) : '—';
  const director = credits?.crew.find(c => c.job === 'Director')?.name ?? '';

  const cast: Actor[] = (credits?.cast ?? []).slice(0, 8).map(a => ({
    id: String(a.id),
    name: a.name,
    role: a.character,
    bio: '',
    knownFor: [],
  }));

  const reviews: Review[] = [];

  return {
    id: `tmdb-${raw.id}`,
    title,
    year,
    genre: genreLabel(raw),
    description: raw.overview || 'No description available.',
    rating: parseFloat(raw.vote_average.toFixed(1)),
    followingsRating: parseFloat(raw.vote_average.toFixed(1)),
    votes: raw.vote_count,
    poster: posterUrl(raw.poster_path),
    backdrop: backdropUrl(raw.backdrop_path),
    director,
    cast,
    reviews,
    quotes: [],
    trivia: [],
    type: isShow ? 'show' : 'movie',
  };
}

async function tmdbFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const key = apiKey();
  if (!key) throw new Error('TMDB_API_KEY is not set');

  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set('api_key', key);
  url.searchParams.set('language', 'en-US');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`TMDB ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

export async function getPopularMovies(page = 1): Promise<Movie[]> {
  const data = await tmdbFetch<{ results: TmdbMovie[] }>('/movie/popular', { page: String(page) });
  return data.results.map(m => tmdbToMovie(m));
}

export async function getPopularShows(page = 1): Promise<Movie[]> {
  const data = await tmdbFetch<{ results: TmdbMovie[] }>('/tv/popular', { page: String(page) });
  return data.results.map(m => tmdbToMovie({ ...m, media_type: 'tv' }));
}

export async function getTrending(): Promise<Movie[]> {
  const data = await tmdbFetch<{ results: TmdbMovie[] }>('/trending/all/week');
  return data.results.map(m => tmdbToMovie(m));
}

export async function searchTmdb(query: string): Promise<Movie[]> {
  const data = await tmdbFetch<{ results: TmdbMovie[] }>('/search/multi', { query });
  return data.results
    .filter(m => m.media_type === 'movie' || m.media_type === 'tv')
    .map(m => tmdbToMovie(m));
}

export async function getMovieById(tmdbId: number): Promise<Movie> {
  const [detail, credits] = await Promise.all([
    tmdbFetch<TmdbMovie>(`/movie/${tmdbId}`, { append_to_response: 'credits' }),
    tmdbFetch<TmdbCredits>(`/movie/${tmdbId}/credits`),
  ]);
  return tmdbToMovie(detail, credits);
}

export async function getShowById(tmdbId: number): Promise<Movie> {
  const [detail, credits] = await Promise.all([
    tmdbFetch<TmdbMovie & { media_type?: 'tv' }>(`/tv/${tmdbId}`),
    tmdbFetch<TmdbCredits>(`/tv/${tmdbId}/credits`),
  ]);
  return tmdbToMovie({ ...detail, media_type: 'tv' }, credits);
}
