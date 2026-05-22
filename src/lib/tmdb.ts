import type { Movie, Actor, Review, Trailer, TvSeason, TvEpisode, EpisodeDetail } from './types';

const BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE = 'https://image.tmdb.org/t/p';

function apiKey() {
  return process.env.TMDB_API_KEY ?? '';
}

function posterUrl(path: string | null, size = 'w500'): string {
  if (!path) return '';
  return `${IMAGE_BASE}/${size}${path}`;
}

function backdropUrl(path: string | null, size = 'w1280'): string {
  if (!path) return '';
  return `${IMAGE_BASE}/${size}${path}`;
}

function profileUrl(path: string | null, seed: string): string {
  if (!path) return `https://picsum.photos/seed/${seed}/200/200`;
  return `${IMAGE_BASE}/w185${path}`;
}

// ─── Raw TMDB shapes ────────────────────────────────────────────────────────

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
  crew: { id: number; name: string; job: string; department: string }[];
}

interface TmdbVideoResult {
  key: string;
  name: string;
  site: string;
  type: string;
  official: boolean;
}

interface TmdbReview {
  id: string;
  author: string;
  author_details: { username: string; rating: number | null; avatar_path: string | null };
  content: string;
  created_at: string;
}

interface TmdbEpisode {
  id: number;
  name: string;
  episode_number: number;
  air_date: string;
  overview: string;
  still_path: string | null;
  vote_average: number;
  runtime: number | null;
}

interface TmdbMovieFull extends TmdbMovie {
  runtime?: number;
  tagline?: string;
  status?: string;
  budget?: number;
  revenue?: number;
  original_language?: string;
  production_companies?: { name: string }[];
  credits?: TmdbCredits;
  videos?: { results: TmdbVideoResult[] };
  images?: { backdrops: { file_path: string }[] };
  reviews?: { results: TmdbReview[] };
}

interface TmdbShowFull extends TmdbMovie {
  episode_run_time?: number[];
  status?: string;
  original_language?: string;
  number_of_episodes?: number;
  type?: string;
  networks?: { name: string }[];
  production_companies?: { name: string }[];
  seasons?: {
    id: number;
    name: string;
    season_number: number;
    episode_count: number;
    air_date: string;
    overview: string;
    poster_path: string | null;
  }[];
  credits?: TmdbCredits;
  videos?: { results: TmdbVideoResult[] };
  images?: { backdrops: { file_path: string }[] };
  reviews?: { results: TmdbReview[] };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function genreLabel(raw: TmdbMovie): string {
  if (raw.genres && raw.genres.length > 0) {
    return raw.genres.slice(0, 2).map(g => g.name).join(' · ');
  }
  if (raw.genre_ids && raw.genre_ids.length > 0) {
    return raw.genre_ids.slice(0, 2).map(id => GENRE_MAP[id]).filter(Boolean).join(' · ') || 'Unknown';
  }
  return 'Unknown';
}

function isShowItem(raw: TmdbMovie): boolean {
  return raw.media_type === 'tv' || (!raw.title && !!raw.name);
}

function buildCast(credits?: TmdbCredits): Actor[] {
  return (credits?.cast ?? []).slice(0, 12).map(a => ({
    id: String(a.id),
    name: a.name,
    role: a.character,
    profileImage: profileUrl(a.profile_path, String(a.id)),
    bio: '',
    knownFor: [],
  }));
}

function parseReviews(results: TmdbReview[]): Review[] {
  return results.slice(0, 6).map(r => {
    let avatarUrl = `https://picsum.photos/seed/${r.id}/100/100`;
    if (r.author_details.avatar_path) {
      const ap = r.author_details.avatar_path;
      avatarUrl = ap.startsWith('/https') ? ap.slice(1) : `${IMAGE_BASE}/w185${ap}`;
    }
    return {
      id: r.id,
      userId: r.author_details.username || r.author,
      userName: r.author_details.username || r.author || 'Anonymous',
      userAvatar: avatarUrl,
      rating: r.author_details.rating ?? 7,
      content: r.content,
      date: new Date(r.created_at).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
      }),
      likes: 0,
    };
  });
}

function parseTrailers(results: TmdbVideoResult[]): Trailer[] {
  return results
    .filter(v => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'))
    .slice(0, 6)
    .map(v => ({ key: v.key, name: v.name, site: v.site, type: v.type }));
}

function parseImages(backdrops: { file_path: string }[]): string[] {
  return backdrops.slice(0, 12).map(b => `${IMAGE_BASE}/w780${b.file_path}`);
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

// ─── List-view converter (no extended fields) ────────────────────────────────

export function tmdbToMovie(raw: TmdbMovie, credits?: TmdbCredits): Movie {
  const isShow = isShowItem(raw);
  const title = raw.title ?? raw.name ?? 'Untitled';
  const releaseDate = raw.release_date ?? raw.first_air_date ?? '';
  const year = releaseDate ? releaseDate.slice(0, 4) : '—';
  const director = credits?.crew.find(c => c.job === 'Director')?.name ?? '';

  return {
    id: isShow ? `tmdb-tv-${raw.id}` : `tmdb-${raw.id}`,
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
    cast: buildCast(credits),
    reviews: [],
    quotes: [],
    trivia: [],
    type: isShow ? 'show' : 'movie',
    releaseDate: releaseDate || undefined,
  };
}

// ─── Multi-page helper ────────────────────────────────────────────────────────

async function fetchManyPages(
  path: string,
  count: number,
  extraParams: Record<string, string> = {},
): Promise<TmdbMovie[]> {
  const pagesNeeded = Math.ceil(count / 20);
  const pageData = await Promise.all(
    Array.from({ length: pagesNeeded }, (_, i) =>
      tmdbFetch<{ results: TmdbMovie[] }>(path, { ...extraParams, page: String(i + 1) }),
    ),
  );
  // Deduplicate by TMDB id — pages can overlap
  const seen = new Set<number>();
  const deduped: TmdbMovie[] = [];
  for (const item of pageData.flatMap(d => d.results)) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      deduped.push(item);
    }
  }
  return deduped.slice(0, count);
}

// ─── List endpoints ───────────────────────────────────────────────────────────

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

export async function getPopularMoviesPaged(count = 25): Promise<Movie[]> {
  const results = await fetchManyPages('/movie/popular', count);
  return results.map(m => tmdbToMovie(m));
}

export async function getPopularShowsPaged(count = 25): Promise<Movie[]> {
  const results = await fetchManyPages('/tv/popular', count);
  return results.map(m => tmdbToMovie({ ...m, media_type: 'tv' }));
}

export async function getTrendingPaged(count = 25): Promise<Movie[]> {
  const results = await fetchManyPages('/trending/all/week', count);
  return results.map(m => tmdbToMovie(m));
}

export async function getPopularShowsEnriched(count = 100): Promise<Movie[]> {
  const shows = await getPopularShowsPaged(count);
  const enriched = await Promise.all(
    shows.map(async (show) => {
      const tmdbId = parseInt(show.id.replace('tmdb-tv-', ''), 10);
      if (isNaN(tmdbId)) return show;
      try {
        const detail = await tmdbFetch<TmdbShowFull>(`/tv/${tmdbId}`);
        return {
          ...show,
          totalEpisodes: detail.number_of_episodes,
          showType: detail.type,
        } as Movie;
      } catch {
        return show;
      }
    }),
  );
  return enriched;
}

export interface PersonResult {
  id: string;
  name: string;
  profileImage: string;
  department: string;
}

interface TmdbPersonSearchResult {
  id: number;
  name: string;
  profile_path: string | null;
  known_for_department: string;
  popularity: number;
}

export async function searchTmdb(query: string): Promise<{ results: Movie[]; people: PersonResult[] }> {
  const [multiData, personData] = await Promise.all([
    tmdbFetch<{ results: (TmdbMovie & { media_type: string })[] }>('/search/multi', { query }),
    tmdbFetch<{ results: TmdbPersonSearchResult[] }>('/search/person', { query }),
  ]);

  const results = multiData.results
    .filter(m => m.media_type === 'movie' || m.media_type === 'tv')
    .map(m => tmdbToMovie(m as TmdbMovie));

  const people: PersonResult[] = (personData.results ?? [])
    .sort((a, b) => b.popularity - a.popularity)
    .map(p => ({
      id: String(p.id),
      name: p.name,
      profileImage: profileUrl(p.profile_path, String(p.id)),
      department: p.known_for_department ?? 'Entertainment',
    }));

  return { results, people };
}

// ─── Detail endpoints (full extended data) ────────────────────────────────────

export async function getMovieDetail(tmdbId: number): Promise<Movie> {
  const detail = await tmdbFetch<TmdbMovieFull>(
    `/movie/${tmdbId}`,
    { append_to_response: 'credits,videos,images,reviews' },
  );

  const base = tmdbToMovie(detail, detail.credits);

  const keyCrew = ['Director', 'Screenplay', 'Writer', 'Story', 'Director of Photography', 'Original Music Composer'];
  const crew = (detail.credits?.crew ?? [])
    .filter(c => keyCrew.includes(c.job))
    .map(c => ({ id: String(c.id), name: c.name, job: c.job }));

  return {
    ...base,
    cast: buildCast(detail.credits),
    trailers: parseTrailers(detail.videos?.results ?? []),
    images: parseImages(detail.images?.backdrops ?? []),
    reviews: parseReviews(detail.reviews?.results ?? []),
    crew,
    runtime: detail.runtime ?? undefined,
    tagline: detail.tagline || undefined,
    status: detail.status,
    releaseDate: detail.release_date,
    budget: detail.budget && detail.budget > 0 ? detail.budget : undefined,
    revenue: detail.revenue && detail.revenue > 0 ? detail.revenue : undefined,
    originalLanguage: detail.original_language,
    productionCompanies: detail.production_companies?.map(c => c.name).slice(0, 4),
  };
}

export async function getShowDetail(tmdbId: number): Promise<Movie> {
  const detail = await tmdbFetch<TmdbShowFull>(
    `/tv/${tmdbId}`,
    { append_to_response: 'credits,videos,images,reviews' },
  );

  const base = tmdbToMovie({ ...detail, media_type: 'tv' }, detail.credits);

  const keyCrew = ['Executive Producer', 'Producer', 'Creator'];
  const crew = (detail.credits?.crew ?? [])
    .filter(c => keyCrew.includes(c.job))
    .slice(0, 6)
    .map(c => ({ id: String(c.id), name: c.name, job: c.job }));

  const seasons: TvSeason[] = (detail.seasons ?? [])
    .filter(s => s.season_number > 0)
    .map(s => ({
      id: s.id,
      name: s.name,
      season_number: s.season_number,
      episode_count: s.episode_count,
      air_date: s.air_date ?? '',
      overview: s.overview ?? '',
      poster_path: s.poster_path,
    }));

  return {
    ...base,
    cast: buildCast(detail.credits),
    trailers: parseTrailers(detail.videos?.results ?? []),
    images: parseImages(detail.images?.backdrops ?? []),
    reviews: parseReviews(detail.reviews?.results ?? []),
    crew,
    seasons,
    networks: detail.networks?.map(n => n.name),
    episodeRuntime: detail.episode_run_time?.[0],
    status: detail.status,
    releaseDate: detail.first_air_date,
    originalLanguage: detail.original_language,
    productionCompanies: detail.production_companies?.map(c => c.name).slice(0, 4),
    totalEpisodes: detail.number_of_episodes,
    showType: detail.type,
  };
}

interface TmdbEpisodeFull extends TmdbEpisode {
  season_number: number;
  vote_count?: number;
  credits?: {
    cast: { id: number; name: string; character: string; profile_path: string | null }[];
    crew: { id: number; name: string; job: string; department: string }[];
    guest_stars: { id: number; name: string; character: string; profile_path: string | null }[];
  };
  images?: { stills: { file_path: string }[] };
  videos?: { results: TmdbVideoResult[] };
}

export async function getTvSeasonEpisodes(showId: number, seasonNumber: number): Promise<TvEpisode[]> {
  const data = await tmdbFetch<{ episodes: TmdbEpisode[] }>(
    `/tv/${showId}/season/${seasonNumber}`,
  );
  return (data.episodes ?? []).map(ep => ({
    id: ep.id,
    name: ep.name,
    episode_number: ep.episode_number,
    air_date: ep.air_date ?? '',
    overview: ep.overview ?? '',
    still_path: ep.still_path,
    vote_average: ep.vote_average,
    runtime: ep.runtime,
  }));
}

export async function getEpisodeDetail(
  showId: number,
  seasonNumber: number,
  episodeNumber: number,
): Promise<EpisodeDetail> {
  const detail = await tmdbFetch<TmdbEpisodeFull>(
    `/tv/${showId}/season/${seasonNumber}/episode/${episodeNumber}`,
    { append_to_response: 'credits,images,videos' },
  );

  const keyCrew = ['Director', 'Writer', 'Screenplay', 'Story', 'Teleplay'];

  return {
    id: detail.id,
    name: detail.name,
    episode_number: detail.episode_number,
    season_number: detail.season_number,
    air_date: detail.air_date ?? '',
    overview: detail.overview ?? '',
    still_path: detail.still_path,
    vote_average: detail.vote_average,
    vote_count: detail.vote_count ?? 0,
    runtime: detail.runtime ?? null,
    cast: buildCast({ cast: detail.credits?.cast ?? [], crew: [] }),
    guestStars: (detail.credits?.guest_stars ?? []).slice(0, 12).map(a => ({
      id: String(a.id),
      name: a.name,
      role: a.character,
      profileImage: profileUrl(a.profile_path, String(a.id)),
      bio: '',
      knownFor: [],
    })),
    crew: (detail.credits?.crew ?? [])
      .filter(c => keyCrew.includes(c.job))
      .slice(0, 8)
      .map(c => ({ id: String(c.id), name: c.name, job: c.job })),
    stills: (detail.images?.stills ?? []).slice(0, 12).map(s => `${IMAGE_BASE}/w780${s.file_path}`),
    trailers: parseTrailers(detail.videos?.results ?? []),
  };
}

// ─── Discover / browse endpoints ──────────────────────────────────────────────

export interface TmdbGenre {
  id: number;
  name: string;
}

export async function getTopRatedMovies(count = 25): Promise<Movie[]> {
  const results = await fetchManyPages('/discover/movie', count, {
    sort_by: 'vote_average.desc',
    'vote_count.gte': '1000',
    include_adult: 'false',
  });
  return results.map(m => tmdbToMovie(m));
}

export async function getTopRatedShows(count = 25): Promise<Movie[]> {
  const results = await fetchManyPages('/discover/tv', count, {
    sort_by: 'vote_average.desc',
    'vote_count.gte': '200',
    include_adult: 'false',
  });
  return results.map(m => tmdbToMovie({ ...m, media_type: 'tv' }));
}

export async function getUpcomingMovies(count = 25): Promise<Movie[]> {
  const results = await fetchManyPages('/movie/upcoming', count);
  return results.map(m => tmdbToMovie(m));
}

export async function getUpcomingShows(count = 25): Promise<Movie[]> {
  const results = await fetchManyPages('/tv/on_the_air', count);
  return results.map(m => tmdbToMovie({ ...m, media_type: 'tv' }));
}

export async function getMovieGenres(): Promise<TmdbGenre[]> {
  const data = await tmdbFetch<{ genres: TmdbGenre[] }>('/genre/movie/list');
  return data.genres ?? [];
}

export async function getTvGenres(): Promise<TmdbGenre[]> {
  const data = await tmdbFetch<{ genres: TmdbGenre[] }>('/genre/tv/list');
  return data.genres ?? [];
}

export async function getMoviesByGenre(genreId: number, count = 25): Promise<Movie[]> {
  const results = await fetchManyPages('/discover/movie', count, {
    with_genres: String(genreId),
    sort_by: 'popularity.desc',
    include_adult: 'false',
  });
  return results.map(m => tmdbToMovie(m));
}

export async function getShowsByGenre(genreId: number, count = 25): Promise<Movie[]> {
  const results = await fetchManyPages('/discover/tv', count, {
    with_genres: String(genreId),
    sort_by: 'popularity.desc',
    include_adult: 'false',
  });
  return results.map(m => tmdbToMovie({ ...m, media_type: 'tv' }));
}

// ─── Person filmography ────────────────────────────────────────────────────────

export interface PersonCreditItem {
  id: string;
  title: string;
  year: string;
  poster: string;
  rating: number;
  type: 'movie' | 'show';
  character?: string;
  job?: string;
}

export interface PersonCreditSection {
  label: string;
  credits: PersonCreditItem[];
}

const EXCLUDED_GENRE_IDS = new Set([10767, 10764, 10763, 99, 10402]); // talk, reality, news, documentary, music

const SECTION_ORDER = ['Actor', 'Director', 'Producer', 'Writer', 'Composer', 'Cinematographer', 'Editor'];

function isValidCredit(item: TmdbMovie & { job?: string; department?: string }): boolean {
  if (item.media_type !== 'movie' && item.media_type !== 'tv') return false;
  const genres = item.genre_ids ?? [];
  if (genres.some(g => EXCLUDED_GENRE_IDS.has(g))) return false;
  const job = item.job ?? '';
  const dept = item.department ?? '';
  if (job === 'Video Game' || dept === 'Video Game') return false;
  const title = item.title ?? item.name ?? '';
  if (title.toLowerCase().includes('video game version')) return false;
  return true;
}

function crewSectionLabel(job: string, department: string): string {
  const j = job.toLowerCase();
  if (j.includes('director') && !j.includes('photography') && !j.includes('casting')) return 'Director';
  if (j.includes('producer')) return 'Producer';
  if (['writer', 'screenplay', 'story', 'novel', 'characters', 'comic book', 'book', 'script'].some(k => j.includes(k))) return 'Writer';
  if (j.includes('composer') || j.includes('music composer') || j === 'original music') return 'Composer';
  if (j.includes('photography') || j.includes('cinematograph')) return 'Cinematographer';
  if (j === 'editor' || j === 'film editor' || j === 'editing') return 'Editor';
  return department || 'Other';
}

function buildCredit(item: TmdbMovie & { character?: string; job?: string }, role?: string): PersonCreditItem {
  const isShow = item.media_type === 'tv';
  const title = item.title ?? item.name ?? '';
  const year = (item.release_date ?? item.first_air_date ?? '').slice(0, 4);
  return {
    id: isShow ? `tmdb-tv-${item.id}` : `tmdb-${item.id}`,
    title,
    year,
    poster: item.poster_path ? posterUrl(item.poster_path, 'w185') : '',
    rating: item.vote_average ?? 0,
    type: isShow ? 'show' : 'movie',
    character: item.character || undefined,
    job: role ?? (item.job || undefined),
  };
}

function isUpcoming(year: string): boolean {
  if (!year) return true;
  return parseInt(year, 10) > new Date().getFullYear();
}

export async function getPersonCredits(personId: number): Promise<{
  name: string;
  profileImage: string;
  sections: PersonCreditSection[];
  upcoming: PersonCreditSection[];
}> {
  const [person, raw] = await Promise.all([
    tmdbFetch<{ name: string; profile_path: string | null }>(`/person/${personId}`),
    tmdbFetch<{
      cast: Array<TmdbMovie & { character?: string; media_type: string; department?: string }>;
      crew: Array<TmdbMovie & { job?: string; department?: string; media_type: string }>;
    }>(`/person/${personId}/combined_credits`),
  ]);

  const bySection: Record<string, Map<string, PersonCreditItem>> = {};
  const byUpcoming: Record<string, Map<string, PersonCreditItem>> = {};

  const add = (maps: Record<string, Map<string, PersonCreditItem>>, label: string, id: string, credit: PersonCreditItem) => {
    if (!maps[label]) maps[label] = new Map();
    if (!maps[label].has(id)) maps[label].set(id, credit);
  };

  for (const item of raw.cast ?? []) {
    if (!isValidCredit(item as TmdbMovie & { job?: string; department?: string })) continue;
    const title = item.title ?? item.name ?? '';
    if (!title) continue;
    const credit = buildCredit(item as TmdbMovie & { character?: string; job?: string });
    const dest = isUpcoming(credit.year) ? byUpcoming : bySection;
    add(dest, 'Actor', credit.id, credit);
  }

  for (const item of raw.crew ?? []) {
    if (!isValidCredit(item as TmdbMovie & { job?: string; department?: string })) continue;
    const title = item.title ?? item.name ?? '';
    if (!title) continue;
    const label = crewSectionLabel(item.job ?? '', item.department ?? '');
    const credit = buildCredit(item as TmdbMovie & { character?: string; job?: string }, item.job);
    const dest = isUpcoming(credit.year) ? byUpcoming : bySection;
    add(dest, label, credit.id, credit);
  }

  const sortByYear = (credits: PersonCreditItem[]) =>
    credits.sort((a, b) => (b.year || '0').localeCompare(a.year || '0'));

  const toSections = (map: Record<string, Map<string, PersonCreditItem>>): PersonCreditSection[] => [
    ...SECTION_ORDER.filter(l => map[l]).map(l => ({ label: l, credits: sortByYear([...map[l].values()]) })),
    ...Object.keys(map).filter(l => !SECTION_ORDER.includes(l)).sort().map(l => ({ label: l, credits: sortByYear([...map[l].values()]) })),
  ];

  return {
    name: person.name,
    profileImage: profileUrl(person.profile_path, String(personId)),
    sections: toSections(bySection),
    upcoming: toSections(byUpcoming),
  };
}
