// Watched episodes on this device live in ONE list per show:
// `watched-eps-index-<showId>` = ["S1E1", "S1E2", …].
//
// There used to be a second shape as well, one `watched-ep-<showId>-S1E2` key per
// episode, written next to the list because Watch History and the profile found
// episodes by walking every localStorage key. A library of 12,946 episodes meant
// 12,946 keys, 18% of the storage a large account used, and a walk over all of
// them on every history load. Everything now reads the per-show lists, so the
// per-episode keys are no longer written and old ones are cleared at login.

const INDEX_PREFIX = 'watched-eps-index-';
const LEGACY_EPISODE_PREFIX = 'watched-ep-';

function readIndex(key: string): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown;
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

/** The episode keys ("S1E2") watched for one show on this device. */
export function readShowEpisodes(showId: string): string[] {
  return readIndex(`${INDEX_PREFIX}${showId}`);
}

/** Whether one episode ("S1E2") of a show is watched on this device. */
export function isEpisodeWatched(showId: string, epKey: string): boolean {
  return readShowEpisodes(showId).includes(epKey);
}

/**
 * Every watched episode on this device as a full episode id
 * ("tmdb-tv-1396-S1E2"). Walks only the per-show lists — a few hundred keys
 * for the largest library, not one per episode.
 */
export function allWatchedEpisodeIds(): string[] {
  const ids: string[] = [];
  try {
    const showKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(INDEX_PREFIX)) showKeys.push(k);
    }
    for (const key of showKeys) {
      const showId = key.slice(INDEX_PREFIX.length);
      for (const ep of readIndex(key)) ids.push(`${showId}-${ep}`);
    }
  } catch { /* ignore */ }
  return ids;
}

/**
 * Removes the old one-key-per-episode entries. Safe to run on every login: the
 * login sync rewrites each show's list from the database straight after, and the
 * database is the source of truth, so nothing is lost by dropping them unread.
 */
export function dropLegacyEpisodeKeys(): number {
  try {
    const stale: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(LEGACY_EPISODE_PREFIX)) stale.push(k);
    }
    for (const k of stale) localStorage.removeItem(k);
    return stale.length;
  } catch {
    return 0;
  }
}
