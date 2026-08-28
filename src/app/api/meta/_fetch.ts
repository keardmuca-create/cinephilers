import type { ItemMeta } from './[id]/route';
import { tmdbRequest } from '@/lib/tmdb-fetch';

const BASE = 'https://api.themoviedb.org/3';
const IMG  = 'https://image.tmdb.org/t/p';

/** {"1":7,"2":13} from TMDB's season list, specials dropped. */
/**
 * How long an episode of this series runs, in minutes.
 *
 * TMDB's `episode_run_time` is the obvious answer and it is empty on most of the
 * shows that matter — 13 of the first 19 checked, Breaking Bad and Game of
 * Thrones among them. So season one is the fallback: its episodes each carry a
 * real runtime, and their average describes the series well enough for "days
 * spent watching".
 *
 * A pilot is often longer than the rest, so the average is taken across the
 * whole season rather than from the first episode.
 *
 * Returns 0 when neither source knows, never a guess — a zero means "no length
 * on record" and the hours it would have contributed are simply left out.
 */
function episodeRuntimeOf(d: Record<string, unknown>): number {
  const declared = (d.episode_run_time as number[] | undefined)?.[0];
  if (typeof declared === 'number' && declared > 0) return declared;

  const season = d['season/1'] as { episodes?: { runtime?: number | null }[] } | undefined;
  const runtimes = (season?.episodes ?? [])
    .map(e => e.runtime)
    .filter((r): r is number => typeof r === 'number' && r > 0);
  if (runtimes.length === 0) return 0;

  return Math.round(runtimes.reduce((sum, r) => sum + r, 0) / runtimes.length);
}

function seasonCountsFrom(seasons: unknown): Record<string, number> | undefined {
  if (!Array.isArray(seasons)) return undefined;
  const out: Record<string, number> = {};
  for (const s of seasons as { season_number?: number; episode_count?: number }[]) {
    if (typeof s?.season_number !== 'number' || s.season_number <= 0) continue;
    if (typeof s.episode_count !== 'number' || s.episode_count <= 0) continue;
    out[String(s.season_number)] = s.episode_count;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export async function fetchOneMeta(id: string, key: string): Promise<ItemMeta> {
  const epMatch = id.match(/^(tmdb-tv-(\d+))-S(\d+)E(\d+)$/);
  if (epMatch) {
    const showId = epMatch[1];
    const tvNum  = parseInt(epMatch[2], 10);
    const season = parseInt(epMatch[3], 10);
    const epNum  = parseInt(epMatch[4], 10);
    const [showRes, epRes] = await Promise.all([
      tmdbRequest(`${BASE}/tv/${tvNum}?api_key=${key}&language=en-US`, { next: { revalidate: 3600 } }),
      tmdbRequest(`${BASE}/tv/${tvNum}/season/${season}/episode/${epNum}?api_key=${key}&language=en-US`, { next: { revalidate: 3600 } }),
    ]);
    const showData = await showRes.json();
    const epData   = await epRes.json();
    const poster   = showData.poster_path ? `${IMG}/w342${showData.poster_path}` : '';
    const epTitle  = epData.name ?? `Episode ${epNum}`;
    const airDate  = epData.air_date ?? showData.first_air_date ?? '';
    const year     = airDate ? airDate.slice(0, 4) : '—';
    return {
      id, title: epTitle, year, releaseDate: airDate, poster,
      type: 'show', showId, isEpisode: true,
      showName: showData.name ?? undefined,
      seasonNumber: season,
      episodeNumber: epNum,
      tmdbRating: typeof epData.vote_average === 'number' ? epData.vote_average : undefined,
      // Carried from the parent show, which this request already fetched. Watch
      // History collapses episodes into one show row and needs the total and the
      // airing status to say "45 / 62" and Completed vs Up to date — and a show
      // you're halfway through was never marked at show level, so its own meta
      // is never loaded. Free here; a separate lookup otherwise.
      showType: showData.type ?? undefined,
      tmdbStatus: showData.status ?? undefined,
      totalEps: showData.number_of_episodes ?? undefined,
    };
  }

  const isShow = id.startsWith('tmdb-tv-');
  const numStr = isShow ? id.replace('tmdb-tv-', '') : id.replace('tmdb-', '');
  const num = parseInt(numStr, 10);
  if (isNaN(num)) throw new Error('Invalid id');

  const path = isShow ? `/tv/${num}` : `/movie/${num}`;
  // append_to_response rides along in the SAME request, so credits cost no
  // extra TMDB call — that's what gives us director and cast for free.
  //
  // Shows ask for season one as well, for one reason: TMDB's own
  // episode_run_time is EMPTY on most major series. Breaking Bad, Game of
  // Thrones, The Sopranos, The Walking Dead, Squid Game and House of the Dragon
  // all return nothing, which is precisely the set of shows people actually
  // finish. Season one's episodes carry a real runtime each, so averaging them
  // gives an episode length for the series — and it rides along in this same
  // request rather than costing another.
  const appended = isShow ? 'credits,season/1' : 'credits';
  const res = await tmdbRequest(`${BASE}${path}?api_key=${key}&language=en-US&append_to_response=${appended}`, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  const d = await res.json();

  const poster = d.poster_path ? `${IMG}/w342${d.poster_path}` : '';
  const title = d.title ?? d.name ?? 'Untitled';
  const release = d.release_date ?? d.first_air_date ?? '';
  const year = release ? release.slice(0, 4) : '—';
  const genreNames: string[] = (d.genres ?? []).map((g: { name: string }) => g.name);
  const crew: { job?: string; name: string }[] = d.credits?.crew ?? [];
  // Shows credit a "Creator" rather than a director.
  const director = crew.find(c => c.job === 'Director')?.name
    ?? (d.created_by ?? [])[0]?.name
    ?? undefined;
  const topCast: string[] = (d.credits?.cast ?? []).slice(0, 5).map((a: { name: string }) => a.name);

  return {
    id, title, year, releaseDate: release, poster,
    type: isShow ? 'show' : 'movie',
    genre: genreNames.join(', ') || undefined,
    director,
    topCast: topCast.length ? topCast : undefined,
    // Movies always carry a numeric runtime (0 when TMDB has none) so the cache
    // can tell a pre-runtime entry (undefined) from one with no known length (0).
    runtime: isShow ? undefined : (typeof d.runtime === 'number' ? d.runtime : 0),
    language: d.original_language ?? undefined,
    showType: isShow ? (d.type ?? undefined) : undefined,
    tmdbStatus: d.status ?? undefined,
    totalEps: isShow ? (d.number_of_episodes ?? undefined) : undefined,
    // The mirror of runtime above: a number for shows (0 when TMDB has none) so a
    // cached entry from before this field can be told from a show whose episode
    // length is genuinely unknown.
    episodeRuntime: isShow ? episodeRuntimeOf(d) : undefined,
    // Episodes per season, so the app can say someone finished season one rather
    // than "13 / 62". Specials (season 0) excluded, matching number_of_episodes.
    seasonCounts: isShow ? seasonCountsFrom(d.seasons) : undefined,
    tmdbRating: typeof d.vote_average === 'number' ? d.vote_average : undefined,
  };
}
