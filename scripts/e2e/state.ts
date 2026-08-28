// Everything one account currently holds, read the way the app reads it.
//
// There are no GET endpoints for /api/watched, /api/ratings and friends — the
// app keeps those in localStorage and reconciles from /api/sync. So the honest
// way to check what a write actually did is to ask sync, which is the same
// answer a real device would get on its next load.
import { api } from './driver';

export interface SyncState {
  ratings: { tmdbId: string; mediaType: string; score: number }[];
  watchlist: { tmdbId: string; mediaType: string }[];
  watched: { tmdbId: string; mediaType: string }[];
  watchedEpisodes: { showTmdbId: string; season: number; episode: number }[];
  reviews: { tmdbId: string; body: string; containsSpoiler: boolean }[];
  favorites: { tmdbId: string; mediaType: string }[];
  lists: unknown[];
  hidden: unknown[];
}

export async function sync(who: string): Promise<SyncState> {
  const r = await api(who, 'GET', '/api/sync');
  if (!r.ok) throw new Error(`sync failed for ${who}: ${r.status} ${r.message ?? ''}`);
  return r.data as SyncState;
}

export function counts(s: SyncState): string {
  return [
    `watched ${s.watched.length}`,
    `episodes ${s.watchedEpisodes.length}`,
    `ratings ${s.ratings.length}`,
    `reviews ${s.reviews.length}`,
    `watchlist ${s.watchlist.length}`,
    `favourites ${s.favorites.length}`,
    `lists ${s.lists.length}`,
  ].join(', ');
}
