import { parseEpisodeId } from './media-id';

// The grey line under an episode wherever one is listed beside films and shows:
// "S2·E1 · The Walking Dead". An episode's title is its own name, so the show it
// belongs to is said here — cut off by the caller, not wrapped, when the show name
// runs long. Season and episode come off the id, so the line is there before the
// meta lands; only the show name waits for it. Undefined for films and shows.
export function episodeLineFor(id: string, meta?: { showName?: unknown } | null): string | undefined {
  const ep = parseEpisodeId(id);
  if (!ep) return undefined;
  const show = typeof meta?.showName === 'string' ? meta.showName : '';
  return `S${ep.season}·E${ep.episode}${show ? ` · ${show}` : ''}`;
}

/** The same line for a caller holding only an id, read off the meta cache. */
export function cachedEpisodeLine(id: string): string | undefined {
  if (!parseEpisodeId(id)) return undefined;
  let meta: { showName?: unknown } | null = null;
  try { meta = JSON.parse(localStorage.getItem(`meta-${id}`) ?? 'null'); } catch { /* ignore */ }
  return episodeLineFor(id, meta);
}
