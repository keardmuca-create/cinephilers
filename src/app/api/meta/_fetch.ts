import type { ItemMeta } from './[id]/route';
import { tmdbRequest } from '@/lib/tmdb-fetch';

const BASE = 'https://api.themoviedb.org/3';
const IMG  = 'https://image.tmdb.org/t/p';

/**
 * A single episode length for the series, in minutes.
 *
 * Secondary now that every episode carries its own runtime: this is the fallback
 * for an episode the map is missing, and the number shown on the film page as
 * "48 min/ep". It is averaged across every episode of every season rather than
 * taken from TMDB's own episode_run_time, which is empty on most major
 * series — 13 of the first 19 checked, Breaking Bad and Game of Thrones
 * included — and, where present, is one declared figure rather than a measure of
 * what actually aired.
 *
 * Returns 0 when nothing is known, never a guess: a zero means "no length on
 * record" and those minutes are simply left out of any total.
 */
function averageEpisodeRuntime(
  runtimes: Record<string, Record<string, number>> | undefined,
  declared: number[] | undefined,
): number {
  const all = Object.values(runtimes ?? {}).flatMap(season => Object.values(season));
  if (all.length > 0) return Math.round(all.reduce((sum, r) => sum + r, 0) / all.length);
  const fallback = declared?.[0];
  return typeof fallback === 'number' && fallback > 0 ? fallback : 0;
}

/**
 * Every episode's own runtime, keyed season → episode → minutes.
 *
 * The average-per-show it replaces was arithmetic on an estimate: Breaking Bad
 * episodes run 43 to 58 minutes and were all counted as 50, so a finished series
 * could be out by hours. If the app is going to show somebody a figure to the
 * minute, the minutes have to be real.
 *
 * TMDB carries the runtime on each episode of a season, and append_to_response
 * takes up to twenty seasons in a single request — so this is one extra call for
 * nearly every series, not one per season. Shows with more than twenty seasons
 * (soaps, mostly) take a second round.
 *
 * Specials (season 0) are skipped, matching every other count in the app.
 */
const APPEND_LIMIT = 20;

async function episodeRuntimesOf(
  showNum: number,
  seasons: unknown,
  key: string,
): Promise<Record<string, Record<string, number>> | undefined> {
  const numbers = Array.isArray(seasons)
    ? (seasons as { season_number?: number }[])
        .map(s => s?.season_number)
        .filter((n): n is number => typeof n === 'number' && n > 0)
    : [];
  if (numbers.length === 0) return undefined;

  const out: Record<string, Record<string, number>> = {};

  for (let i = 0; i < numbers.length; i += APPEND_LIMIT) {
    const chunk = numbers.slice(i, i + APPEND_LIMIT);
    const append = chunk.map(n => `season/${n}`).join(',');
    try {
      const res = await tmdbRequest(
        `${BASE}/tv/${showNum}?api_key=${key}&language=en-US&append_to_response=${append}`,
        { next: { revalidate: 3600 } },
      );
      if (!res.ok) continue;
      const data = await res.json() as Record<string, unknown>;
      for (const n of chunk) {
        const season = data[`season/${n}`] as { episodes?: { episode_number?: number; runtime?: number | null }[] } | undefined;
        const episodes = season?.episodes ?? [];
        const map: Record<string, number> = {};
        for (const ep of episodes) {
          if (typeof ep.episode_number !== 'number') continue;
          if (typeof ep.runtime !== 'number' || ep.runtime <= 0) continue;
          map[String(ep.episode_number)] = ep.runtime;
        }
        if (Object.keys(map).length > 0) out[String(n)] = map;
      }
    } catch {
      // A season that won't load costs that season's precision, not the whole
      // show — the per-show average still covers anything missing here.
      continue;
    }
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

/** {"1":7,"2":13} from TMDB's season list, specials dropped. */
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
  const res = await tmdbRequest(`${BASE}${path}?api_key=${key}&language=en-US&append_to_response=credits`, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  const d = await res.json();

  // Which seasons exist is only known once the show itself has answered, so the
  // episode runtimes are a second request rather than an append on this one.
  const episodeRuntimes = isShow ? await episodeRuntimesOf(num, d.seasons, key) : undefined;

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
    episodeRuntime: isShow ? averageEpisodeRuntime(episodeRuntimes, d.episode_run_time) : undefined,
    // Season -> episode -> minutes. The exact figures; the average above is only
    // the fallback for anything missing here.
    episodeRuntimes,
    // Episodes per season, so the app can say someone finished season one rather
    // than "13 / 62". Specials (season 0) excluded, matching number_of_episodes.
    seasonCounts: isShow ? seasonCountsFrom(d.seasons) : undefined,
    tmdbRating: typeof d.vote_average === 'number' ? d.vote_average : undefined,
  };
}
