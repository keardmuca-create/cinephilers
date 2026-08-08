import type { Movie, Actor, Review, Trailer, TvSeason, TvEpisode, EpisodeDetail, MovieCollection } from './types';

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

// w342, not w185. The cast card on a title page is 144 CSS pixels wide, which is
// 432 real pixels on a 3× phone — and images are served unoptimised straight from
// TMDB (see next.config.ts), so the file we name here is the file the browser
// gets. w185 was being stretched to more than twice its size, which is the whole
// reason actor photos looked soft. Costs nothing on our side: it is TMDB's CDN
// either way, and Vercel never touches the bytes.
function profileUrl(path: string | null): string {
  if (!path) return '';
  return `${IMAGE_BASE}/w342${path}`;
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
  original_language?: string;
}

interface TmdbCredits {
  cast: { id: number; name: string; character: string; profile_path: string | null }[];
  crew: { id: number; name: string; job: string; department: string; profile_path: string | null }[];
}

interface TmdbVideoResult {
  key: string;
  name: string;
  site: string;
  type: string;
  official: boolean;
  /** Vertical resolution — 360, 720, 1080, 2160. */
  size?: number;
  published_at?: string;
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
  belongs_to_collection?: { id: number; name: string; poster_path: string | null } | null;
  credits?: TmdbCredits;
  videos?: { results: TmdbVideoResult[] };
  images?: { backdrops: { file_path: string }[] };
  reviews?: { results: TmdbReview[] };
}

interface TmdbCollection {
  id: number;
  name: string;
  parts: { id: number; title?: string; release_date?: string; poster_path: string | null; vote_average?: number }[];
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
  next_episode_to_air?: {
    season_number: number;
    episode_number: number;
    name: string;
    air_date: string | null;
    episode_type?: string;
  } | null;
  credits?: TmdbCredits;
  /**
   * Everyone who appeared across the whole series, not just the regulars.
   * `credits` on a TV show returns the main cast ONLY — five people for King of
   * the Hill — so every guest star was invisible, including ones the app's own
   * person pages send you here to find.
   */
  aggregate_credits?: {
    cast: {
      id: number;
      name: string;
      profile_path: string | null;
      total_episode_count?: number;
      roles?: { character: string; episode_count: number }[];
    }[];
  };
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
  return (credits?.cast ?? []).slice(0, 50).map(a => ({
    id: String(a.id),
    name: a.name,
    role: a.character,
    profileImage: profileUrl(a.profile_path),
    bio: '',
    knownFor: [],
  }));
}

/** How many names the title page itself draws before its "See All" link. */
const TITLE_PAGE_CAST = 20;

/**
 * A show's whole cast, regulars first. TMDB's plain `credits` for a series
 * returns ONLY the main cast — five people for King of the Hill — so anyone who
 * guest-starred was missing entirely. `aggregate_credits` is everyone who ever
 * appeared, which is what a viewer arriving from an actor's page is looking for.
 */
function sortedAggregateCast(detail: TmdbShowFull): Actor[] {
  return (detail.aggregate_credits?.cast ?? [])
    .slice()
    .sort((a, b) => (b.total_episode_count ?? 0) - (a.total_episode_count ?? 0))
    .map(a => ({
      id: String(a.id),
      name: a.name,
      role: a.roles?.[0]?.character ?? '',
      profileImage: profileUrl(a.profile_path),
      bio: '',
      knownFor: [],
    }));
}

function parseReviews(results: TmdbReview[]): Review[] {
  return results.slice(0, 6).map(r => {
    let avatarUrl = '';
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

/**
 * TMDB lists videos in no useful order, and we were taking the first six as they
 * came. For Dune: Part Two that meant six teasers — "Vision ASMR", "#1 Movie in
 * the World" — while the actual trailer sat in the data unseen. Oppenheimer led
 * with two TV spots. Inception led with an unofficial upload followed by six
 * thirty-second spots. The Dark Knight led with its 360p copy while the 1080p
 * ones waited below.
 *
 * TMDB does not report a video's duration, so "full trailer" has to be inferred
 * from what it does tell us: a Trailer outranks a Teaser, an official upload
 * outranks a fan copy, and a sharper file outranks a soft one.
 */
function parseTrailers(results: TmdbVideoResult[]): Trailer[] {
  const rank = (v: TmdbVideoResult) =>
    (v.type === 'Trailer' ? 1000 : 0) +
    (v.official ? 500 : 0) +
    (v.size ?? 0) / 10;

  return results
    .filter(v => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'))
    .slice()
    .sort((a, b) => {
      const diff = rank(b) - rank(a);
      if (diff !== 0) return diff;
      // Same standing — show the newer cut, which is usually the one people mean.
      return (b.published_at ?? '').localeCompare(a.published_at ?? '');
    })
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
    originalLanguage: raw.original_language,
  };
}

// ─── Discovery feed filters ───────────────────────────────────────────────────
// These keep low-quality / regionally-skewed titles out of the home screen and
// suggestion rows. SEARCH intentionally does NOT use them — searched titles must
// always be findable.

// Original languages excluded from discovery/home feeds (still fully searchable).
// Covers the major Indian film industries.
const EXCLUDED_ORIGINAL_LANGUAGES = new Set([
  'hi', 'ta', 'te', 'ml', 'kn', 'bn', 'mr', 'pa', 'gu',
]);

export function isExcludedLanguage(m: { original_language?: string }): boolean {
  return !!m.original_language && EXCLUDED_ORIGINAL_LANGUAGES.has(m.original_language);
}

// The daily-television genres. Soaps, talk shows, reality and news run five
// episodes a week forever, so they climb TMDB's popularity charts on volume alone
// and crowd out the thing someone actually opened the app to find. They are not
// what Cinephilers is for — but they are still real titles, so this only applies
// to browse/discovery rows. Search deliberately skips these filters, so anyone
// looking for a soap by name still finds it.
//
// Documentaries and music are NOT here on purpose: they belong on a home screen.
// (The person-credits list uses its own wider set — a filmography is a different
// question from a recommendation.)
const DAILY_TV_GENRE_IDS = new Set([
  10763, // News
  10764, // Reality
  10766, // Soap
  10767, // Talk
]);

// Exported because the home pool builds its own list against TMDB directly and
// has to apply the same rule. It only needs the genre ids, so it takes the
// narrowest shape that answers the question rather than a whole TmdbMovie.
export function isDailyTelevision(m: { genre_ids?: number[] }): boolean {
  return (m.genre_ids ?? []).some(g => DAILY_TV_GENRE_IDS.has(g));
}

// How many votes a title needs before it can appear on a browse or discovery row.
//
// Was 50, which was only ever meant to drop titles showing "0.0" with nothing
// behind them. 50 turned out to be almost no bar at all: the home pool's MEDIAN
// is around 2,600 votes, so everything under a few hundred was the junk tail —
// obscure straight-to-nothing thrillers, a wrestling show TMDB has mislabelled as
// scripted drama, and an adult anime with 90 votes that TMDB does not flag as
// adult at all. Anything genuinely worth a home screen clears this easily.
//
// The cost, stated plainly: a real new release starts at zero votes and stays off
// these rows for a few days until it earns 500. Coming Soon is where new titles
// live and it has no vote floor by design, so nothing unreleased is affected.
const MIN_DISCOVERY_VOTES = 500;

/** The fields any discovery filter needs. Narrow on purpose — the home pool
 *  builds its own list straight from TMDB and has only raw JSON to offer. */
export interface DiscoveryCandidate {
  vote_count?: number;
  vote_average?: number;
  poster_path?: string | null;
  original_language?: string;
  genre_ids?: number[];
}

// The one gate every rated browse/discovery row passes through. Exported so the
// home pool uses THIS rather than its own copy — a duplicated version of these
// rules is exactly why talk shows were still reaching Featured Today after they
// had been filtered everywhere else.
//
// Search deliberately does not call this, and must not. Adult titles, soaps and
// obscure films all stay findable by name; the filter decides what we put in
// front of people, never what they are allowed to look up.
export function passesDiscoveryFilters(m: DiscoveryCandidate): boolean {
  return (m.vote_count ?? 0) >= MIN_DISCOVERY_VOTES
    && (m.vote_average ?? 0) > 0
    && !!m.poster_path
    && !isExcludedLanguage(m)
    && !isDailyTelevision(m);
}

function ratedFeedFilter(m: TmdbMovie): boolean {
  return passesDiscoveryFilters(m);
}

// Language-only filter — for feeds where a quality floor doesn't apply
// (e.g. unreleased/upcoming titles legitimately have 0 votes).
function languageOnlyFilter(m: TmdbMovie): boolean {
  return !isExcludedLanguage(m) && !isDailyTelevision(m);
}

// ─── Multi-page helper ────────────────────────────────────────────────────────

async function fetchManyPages(
  path: string,
  count: number,
  extraParams: Record<string, string> = {},
  filter?: (m: TmdbMovie) => boolean,
): Promise<TmdbMovie[]> {
  // When filtering, over-fetch so post-filter results still reach `count`.
  const basePages = Math.ceil(count / 20);
  const pagesNeeded = filter ? Math.min(basePages * 2 + 1, 10) : basePages;
  const pageData = await Promise.all(
    Array.from({ length: pagesNeeded }, (_, i) =>
      tmdbFetch<{ results: TmdbMovie[] }>(path, { ...extraParams, page: String(i + 1) }),
    ),
  );
  // Deduplicate by TMDB id — pages can overlap
  const seen = new Set<number>();
  const deduped: TmdbMovie[] = [];
  for (const item of pageData.flatMap(d => d.results)) {
    if (seen.has(item.id)) continue;
    if (filter && !filter(item)) continue;
    seen.add(item.id);
    deduped.push(item);
  }
  return deduped.slice(0, count);
}

// ─── List endpoints ───────────────────────────────────────────────────────────

export async function getPopularMovies(page = 1): Promise<Movie[]> {
  const data = await tmdbFetch<{ results: TmdbMovie[] }>('/movie/popular', { page: String(page) });
  return data.results.filter(ratedFeedFilter).map(m => tmdbToMovie(m));
}

export async function getPopularShows(page = 1): Promise<Movie[]> {
  const data = await tmdbFetch<{ results: TmdbMovie[] }>('/tv/popular', { page: String(page) });
  return data.results.filter(ratedFeedFilter).map(m => tmdbToMovie({ ...m, media_type: 'tv' }));
}

export async function getTrending(): Promise<Movie[]> {
  const data = await tmdbFetch<{ results: TmdbMovie[] }>('/trending/all/week');
  return data.results.filter(ratedFeedFilter).map(m => tmdbToMovie(m));
}

export async function getPopularMoviesPaged(count = 25): Promise<Movie[]> {
  const results = await fetchManyPages('/movie/popular', count, {}, ratedFeedFilter);
  return results.map(m => tmdbToMovie(m));
}

export async function getPopularShowsPaged(count = 25): Promise<Movie[]> {
  const results = await fetchManyPages('/tv/popular', count, {}, ratedFeedFilter);
  return results.map(m => tmdbToMovie({ ...m, media_type: 'tv' }));
}

export async function getTrendingPaged(count = 25): Promise<Movie[]> {
  const results = await fetchManyPages('/trending/all/week', count, {}, ratedFeedFilter);
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

export type CombinedSearchResult =
  | { kind: 'movie'; data: Movie }
  | { kind: 'person'; data: PersonResult }

// Departments considered "main talent" — shown after movies without requiring a full-name match
const MAIN_TALENT_DEPTS = new Set(['Acting', 'Directing']);

/**
 * How strongly a search result should rank. See the note in searchTmdb for why
 * the title match multiplies rather than adds.
 */
function searchScore(raw: TmdbMovie & { popularity?: number }, query: string): number {
  const title = (raw.title ?? raw.name ?? '').toLowerCase().trim();
  const q = query.toLowerCase().trim();

  // Votes say what people have actually seen; popularity carries titles that are
  // anticipated but unrated, so a sequel out next month is not buried beneath
  // decades-old obscurities that have collected a handful of votes.
  const known = (raw.vote_count ?? 0) + (raw.popularity ?? 0) * 50;

  if (title === q) return known * 3;
  if (title.startsWith(q)) return known * 1.5;
  if (title.includes(q)) return known;
  // TMDB matched this on something invisible to the reader — a keyword, a cast
  // member. Searching "dune" surfaced Anatomy of a Fall this way. Kept, because
  // the match may still be meaningful, but never above a real title match.
  return known * 0.15;
}

export async function searchTmdb(query: string): Promise<{ results: Movie[]; people: PersonResult[]; combined: CombinedSearchResult[] }> {
  const multiData = await tmdbFetch<{
    results: (TmdbMovie & { media_type: string; profile_path?: string | null; known_for_department?: string })[]
  }>('/search/multi', { query });

  const talentItems: CombinedSearchResult[] = [];   // actors + directors
  const crewItems: CombinedSearchResult[] = [];     // other crew — only shown on full-name match
  const results: Movie[] = [];
  const people: PersonResult[] = [];

  const queryLower = query.toLowerCase().trim();

  // Raw items kept alongside the mapped ones: ranking needs vote_count and
  // popularity, which Movie does not carry.
  const scored: { movie: Movie; raw: TmdbMovie }[] = [];

  for (const item of multiData.results ?? []) {
    if (item.media_type === 'movie' || item.media_type === 'tv') {
      const movie = tmdbToMovie(item as TmdbMovie);
      results.push(movie);
      scored.push({ movie, raw: item as TmdbMovie });
    } else if (item.media_type === 'person') {
      const person: PersonResult = {
        id: String(item.id),
        name: (item as { name?: string }).name ?? '',
        profileImage: profileUrl(item.profile_path ?? null),
        department: item.known_for_department ?? 'Entertainment',
      };
      people.push(person);

      const dept = person.department;
      if (MAIN_TALENT_DEPTS.has(dept)) {
        talentItems.push({ kind: 'person', data: person });
      } else {
        // Only include other crew if every word of their name appears in the query
        const nameWords = person.name.toLowerCase().split(/\s+/).filter(Boolean);
        const isFullName = nameWords.length > 1 && nameWords.every(w => queryLower.includes(w));
        if (isFullName) crewItems.push({ kind: 'person', data: person });
      }
    }
  }

  // TMDB's own order weights the title match far above how known a title is, so
  // searching "batman" led with the 1966 series (609 votes) and pushed Batman
  // Begins (22,899) to fourth; "alien" led with Resident Alien; "godfather" put
  // Godfather of Harlem above Part II.
  //
  // Each result is scored on how known it is, then MULTIPLIED by how well its
  // title matches. Multiplied, not added: a flat bonus for exact matches let
  // every obscure film literally called "Joker" outrank Joker: Folie a Deux,
  // which was worse than the problem being fixed. A multiplier amplifies a
  // title's own standing instead of overriding it, which keeps the opposite case
  // working too — searching "ariel" still finds Kaurismaki's 1988 film, because
  // an exact match on a little-known title still beats a loose match on a famous
  // one.
  const orderedResults = scored
    .map((s, i) => ({ ...s, i }))
    .sort((a, b) => {
      const diff = searchScore(b.raw, query) - searchScore(a.raw, query);
      return diff !== 0 ? diff : a.i - b.i;
    })
    .map(s => s.movie);

  const movieItems: CombinedSearchResult[] = orderedResults.map(m => ({ kind: 'movie', data: m }));
  const combined: CombinedSearchResult[] = [...movieItems, ...talentItems, ...crewItems];
  return { results: orderedResults, people, combined };
}

// ─── Detail endpoints (full extended data) ────────────────────────────────────

// Other films in the same franchise (e.g. all three Dune parts), sorted into
// release order so the first/earlier entries a viewer may have missed lead the
// strip. TMDB returns parts unsorted; undated (TBA) entries sink to the end.
// Returns undefined for one-film "collections" — nothing worth showing.
export async function getMovieCollection(collectionId: number, currentTmdbId: number): Promise<MovieCollection | undefined> {
  try {
    const data = await tmdbFetch<TmdbCollection>(`/collection/${collectionId}`);
    const parts = (data.parts ?? [])
      .filter(p => p.title)
      .map(p => ({
        id: `tmdb-${p.id}`,
        title: p.title!,
        year: p.release_date ? p.release_date.slice(0, 4) : '—',
        poster: posterUrl(p.poster_path, 'w342'),
        releaseDate: p.release_date ?? '',
        tmdbRating: typeof p.vote_average === 'number' && p.vote_average > 0 ? p.vote_average : undefined,
        isCurrent: p.id === currentTmdbId,
      }))
      .sort((a, b) => {
        if (!a.releaseDate) return 1;
        if (!b.releaseDate) return -1;
        return a.releaseDate.localeCompare(b.releaseDate);
      });
    if (parts.length < 2) return undefined;
    return { id: data.id, name: data.name, parts };
  } catch {
    return undefined;
  }
}

export async function getMovieDetail(tmdbId: number): Promise<Movie> {
  const detail = await tmdbFetch<TmdbMovieFull>(
    `/movie/${tmdbId}`,
    { append_to_response: 'credits,videos,images,reviews' },
  );

  const base = tmdbToMovie(detail, detail.credits);

  const keyCrew = ['Director', 'Screenplay', 'Writer', 'Story', 'Director of Photography', 'Original Music Composer'];
  const crew = (detail.credits?.crew ?? [])
    .filter(c => keyCrew.includes(c.job))
    // TMDB has always sent a portrait for crew alongside the cast's; it just was
    // not being read, which is why the Cast & Crew page drew a film icon for
    // people who have a photograph.
    .map(c => ({ id: String(c.id), name: c.name, job: c.job, profileImage: profileUrl(c.profile_path) }));

  const collection = detail.belongs_to_collection
    ? await getMovieCollection(detail.belongs_to_collection.id, tmdbId)
    : undefined;

  return {
    ...base,
    // Twenty here, the rest from /api/movies/[id]/cast — see getFullCast.
    cast: buildCast(detail.credits).slice(0, TITLE_PAGE_CAST),
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
    collection,
  };
}

export async function getShowDetail(tmdbId: number): Promise<Movie> {
  const detail = await tmdbFetch<TmdbShowFull>(
    `/tv/${tmdbId}`,
    { append_to_response: 'credits,aggregate_credits,videos,images,reviews' },
  );

  const base = tmdbToMovie({ ...detail, media_type: 'tv' }, detail.credits);

  const keyCrew = ['Executive Producer', 'Producer', 'Creator'];
  const crew = (detail.credits?.crew ?? [])
    .filter(c => keyCrew.includes(c.job))
    .slice(0, 6)
    .map(c => ({ id: String(c.id), name: c.name, job: c.job, profileImage: profileUrl(c.profile_path) }));

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

  // Only what the title page draws. The full list — every guest star across the
  // series, which for King of the Hill is 384 people — is served separately by
  // getFullCast, because shipping all of it here added ~50KB to a payload whose
  // page renders twelve names.
  const aggregateCast = sortedAggregateCast(detail).slice(0, TITLE_PAGE_CAST);

  return {
    ...base,
    // Falls back to the regulars if aggregate_credits is missing, which happens
    // on shows TMDB has barely any data for.
    cast: aggregateCast.length > 0 ? aggregateCast : buildCast(detail.credits).slice(0, TITLE_PAGE_CAST),
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
    // Only when TMDB actually has a date. A next episode with no air date tells
    // a reader nothing, and "coming soon" is not worth a line on the page.
    nextEpisode: detail.next_episode_to_air?.air_date
      ? {
          season: detail.next_episode_to_air.season_number,
          episode: detail.next_episode_to_air.episode_number,
          name: detail.next_episode_to_air.name,
          airDate: detail.next_episode_to_air.air_date,
          episodeType: detail.next_episode_to_air.episode_type,
        }
      : undefined,
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
      profileImage: profileUrl(a.profile_path),
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
  }, languageOnlyFilter);
  return results.map(m => tmdbToMovie(m));
}

// 1000, matching Top 100 Movies. It was 200, which put a lower bar on "the best
// television ever made" than an ordinary Popular row — a 9.4 from 200 people is
// not a chart position, and sorting by vote_average descending is exactly where a
// thin vote count does the most damage.
export async function getTopRatedShows(count = 25): Promise<Movie[]> {
  const results = await fetchManyPages('/discover/tv', count, {
    sort_by: 'vote_average.desc',
    'vote_count.gte': '1000',
    include_adult: 'false',
  }, languageOnlyFilter);
  return results.map(m => tmdbToMovie({ ...m, media_type: 'tv' }));
}

function tomorrowDate(): string {
  return new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
}

export async function getUpcomingMovies(count = 25): Promise<Movie[]> {
  const results = await fetchManyPages('/discover/movie', count, {
    'primary_release_date.gte': tomorrowDate(),
    sort_by: 'popularity.desc',
    include_adult: 'false',
  }, m => languageOnlyFilter(m) && !!m.poster_path);
  return results.map(m => tmdbToMovie(m));
}

export async function getUpcomingShows(count = 25): Promise<Movie[]> {
  const results = await fetchManyPages('/discover/tv', count, {
    'first_air_date.gte': tomorrowDate(),
    sort_by: 'popularity.desc',
  }, m => languageOnlyFilter(m) && !!m.poster_path);
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
  }, ratedFeedFilter);
  return results.map(m => tmdbToMovie(m));
}

export async function getShowsByGenre(genreId: number, count = 25): Promise<Movie[]> {
  const results = await fetchManyPages('/discover/tv', count, {
    with_genres: String(genreId),
    sort_by: 'popularity.desc',
    include_adult: 'false',
  }, ratedFeedFilter);
  return results.map(m => tmdbToMovie({ ...m, media_type: 'tv' }));
}

// "Because you liked X" — TMDB's own recommendations for a single title.
// Used to build genuinely personalized Top Picks from a user's rated history.
export async function getRecommendationsFor(
  tmdbId: number,
  mediaType: 'movie' | 'tv',
  count = 20,
): Promise<Movie[]> {
  const path = mediaType === 'tv'
    ? `/tv/${tmdbId}/recommendations`
    : `/movie/${tmdbId}/recommendations`;
  try {
    const data = await tmdbFetch<{ results: TmdbMovie[] }>(path, { page: '1' });
    const results = (data.results ?? []).filter(ratedFeedFilter);
    const mapped = mediaType === 'tv'
      ? results.map(m => tmdbToMovie({ ...m, media_type: 'tv' }))
      : results.map(m => tmdbToMovie(m));
    return mapped.slice(0, count);
  } catch {
    return [];
  }
}

// Map a genre NAME (as stored in User.favoriteGenres) to its TMDB id.
const GENRE_NAME_TO_ID: Record<string, number> = Object.fromEntries(
  Object.entries(GENRE_MAP).map(([id, name]) => [name.toLowerCase(), Number(id)]),
);
export function genreNameToId(name: string): number | undefined {
  return GENRE_NAME_TO_ID[name.trim().toLowerCase()];
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

const EXCLUDED_GENRE_IDS = new Set([10767, 10764, 10763, 10766, 99, 10402]); // talk, reality, news, soap, documentary, music

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

// Upcoming = a confirmed future release date. No date = treat as released to avoid
// misclassifying old films where TMDB omits the date in combined_credits.
function isUpcoming(item: { release_date?: string; first_air_date?: string }): boolean {
  const date = item.release_date ?? item.first_air_date ?? '';
  if (!date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(date) > today;
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
    const dest = isUpcoming(item) ? byUpcoming : bySection;
    add(dest, 'Actor', credit.id, credit);
  }

  for (const item of raw.crew ?? []) {
    if (!isValidCredit(item as TmdbMovie & { job?: string; department?: string })) continue;
    const title = item.title ?? item.name ?? '';
    if (!title) continue;
    const label = crewSectionLabel(item.job ?? '', item.department ?? '');
    const credit = buildCredit(item as TmdbMovie & { character?: string; job?: string }, item.job);
    const dest = isUpcoming(item) ? byUpcoming : bySection;
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
    profileImage: profileUrl(person.profile_path),
    sections: toSections(bySection),
    upcoming: toSections(byUpcoming),
  };
}

// ─── Where to watch ──────────────────────────────────────────────────────────
// TMDB's watch-provider data comes from JustWatch, whose terms require the
// attribution shown alongside it in the UI. Availability differs per country, so
// the region is a parameter rather than a guess — see the providers route for
// how it is chosen and why it is not folded into the main detail payload.

export interface WatchProvider {
  id: number;
  name: string;
  logo: string;
}

export interface WatchProviders {
  region: string;
  /** JustWatch page for this title — the "where to watch" deep link TMDB gives us. */
  link?: string;
  /** Included with a subscription. The only kind most people care about. */
  streaming: WatchProvider[];
  rent: WatchProvider[];
  buy: WatchProvider[];
  /** Free with ads. */
  free: WatchProvider[];
}

interface TmdbProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
  display_priority?: number;
}

interface TmdbProviderRegion {
  link?: string;
  flatrate?: TmdbProvider[];
  rent?: TmdbProvider[];
  buy?: TmdbProvider[];
  free?: TmdbProvider[];
  ads?: TmdbProvider[];
}

export async function getWatchProviders(
  tmdbId: number,
  isShow: boolean,
  region: string,
): Promise<WatchProviders | null> {
  const path = `${isShow ? '/tv' : '/movie'}/${tmdbId}/watch/providers`;
  try {
    const data = await tmdbFetch<{ results?: Record<string, TmdbProviderRegion> }>(path);
    const forRegion = data.results?.[region.toUpperCase()] ?? {};

    const map = (list?: TmdbProvider[]): WatchProvider[] =>
      (list ?? [])
        .sort((a, b) => (a.display_priority ?? 99) - (b.display_priority ?? 99))
        .map(p => ({
          id: p.provider_id,
          name: p.provider_name,
          logo: p.logo_path ? `${IMAGE_BASE}/w92${p.logo_path}` : '',
        }));

    // "Free" folds in ad-supported: from a viewer's side of the screen, both mean
    // "you can watch this now without paying".
    const free = map([...(forRegion.free ?? []), ...(forRegion.ads ?? [])]);
    const providers: WatchProviders = {
      region: region.toUpperCase(),
      link: forRegion.link,
      streaming: map(forRegion.flatrate),
      rent: map(forRegion.rent),
      buy: map(forRegion.buy),
      free,
    };

    // Returned even when every list is empty. "We asked and found nothing" and
    // "we could not ask" are different facts, and the page says different things
    // about them — so null is reserved for the failure below, never for an
    // answer that happens to be empty.
    return providers;
  } catch {
    // Never let this break a title page — it is an extra, not the point.
    return null;
  }
}

// ─── Full cast (the Cast & Crew page only) ───────────────────────────────────
// Split out from the title payload deliberately. A long-running series carries
// hundreds of credited actors — King of the Hill has 384 — and sending them with
// every title view cost ~50KB to render twelve names. This is opened rarely, so
// the weight sits where it is actually used.

export async function getFullCast(tmdbId: number, isShow: boolean): Promise<Actor[]> {
  if (isShow) {
    const detail = await tmdbFetch<TmdbShowFull>(`/tv/${tmdbId}`, { append_to_response: 'aggregate_credits,credits' });
    const aggregate = sortedAggregateCast(detail);
    // 500 is a sanity bound against a soap opera with a four-figure cast, not a
    // display decision. Falls back to the regulars when TMDB has no aggregate.
    return aggregate.length > 0 ? aggregate.slice(0, 500) : buildCast(detail.credits);
  }
  const detail = await tmdbFetch<{ credits?: TmdbCredits }>(`/movie/${tmdbId}`, { append_to_response: 'credits' });
  return buildCast(detail.credits);
}
