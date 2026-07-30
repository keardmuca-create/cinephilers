import type { ItemMeta } from './[id]/route';

const BASE = 'https://api.themoviedb.org/3';
const IMG  = 'https://image.tmdb.org/t/p';

export async function fetchOneMeta(id: string, key: string): Promise<ItemMeta> {
  const epMatch = id.match(/^(tmdb-tv-(\d+))-S(\d+)E(\d+)$/);
  if (epMatch) {
    const showId = epMatch[1];
    const tvNum  = parseInt(epMatch[2], 10);
    const season = parseInt(epMatch[3], 10);
    const epNum  = parseInt(epMatch[4], 10);
    const [showRes, epRes] = await Promise.all([
      fetch(`${BASE}/tv/${tvNum}?api_key=${key}&language=en-US`, { next: { revalidate: 3600 } }),
      fetch(`${BASE}/tv/${tvNum}/season/${season}/episode/${epNum}?api_key=${key}&language=en-US`, { next: { revalidate: 3600 } }),
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
  const res = await fetch(`${BASE}${path}?api_key=${key}&language=en-US&append_to_response=credits`, { next: { revalidate: 3600 } });
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
    tmdbRating: typeof d.vote_average === 'number' ? d.vote_average : undefined,
  };
}
