// One watch-history row per title, for anyone looking at a profile.
//
// A user's watch history lives in two tables: WatchedItem (films, plus shows
// marked at show level) and WatchedEpisode (individual episodes). Reading only
// the first made every ticked episode invisible to other people — you could see
// your own Breaking Bad progress because your browser held it in localStorage,
// but nobody else's browser has that. So the grouping the history page does on
// the client has to happen here too, or public profiles show a different library
// to the one the owner sees.
//
// It also has to happen BEFORE the show's own watched record is dropped: once
// episodes are the only stored record, an endpoint reading WatchedItem alone
// would return nothing at all for shows.

import { prisma } from '@/lib/db';
import { statusFor, type ShowProgressStatus } from '@/lib/collapse-shows';

export interface WatchedRow {
  tmdbId: string;
  mediaType: 'MOVIE' | 'SHOW';
  watchedAt: Date;
  /** Episodes ticked, for a show assembled from WatchedEpisode. */
  watchedEpisodes?: number;
  /** From FilmMeta.episodeCount; 0 when we haven't backfilled that show yet. */
  totalEpisodes?: number;
  status?: ShowProgressStatus;
}

// Deep pages scan more WatchedItem rows to merge against, so cap the scan rather
// than let a crafted ?page= read someone's whole library into memory. At the
// public profile's 60-a-page this covers the first ~30 pages.
const MAX_SCAN = 2000;

export interface WatchedRowsResult {
  rows: WatchedRow[];
  total: number;
}

/**
 * One page of a user's watch history, films and shows merged, newest first.
 * A show appears exactly once whether it was marked whole, ticked episode by
 * episode, or both — carrying its progress either way.
 */
export async function listWatchedRows(
  userId: string,
  { page, limit, year }: { page: number; limit: number; year?: number },
): Promise<WatchedRowsResult> {
  const yearWhere = year
    ? { watchedAt: { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) } }
    : {};

  // One group per show the user has ticked anything in — a handful of rows even
  // for a heavy watcher, so these are all fetched rather than paginated.
  const episodeGroups = await prisma.watchedEpisode.groupBy({
    by: ['showTmdbId'],
    where: { userId, ...yearWhere },
    _count: { _all: true },
    _max: { watchedAt: true },
  });
  const showIds = episodeGroups.map(g => g.showTmdbId);

  // Dedupe shifts entries forward, so scan enough WatchedItem rows to still fill
  // the page after the show-level duplicates drop out.
  const scan = Math.min(page * limit + showIds.length, MAX_SCAN);

  const [itemTotal, overlap, items, showMeta] = await Promise.all([
    prisma.watchedItem.count({ where: { userId, ...yearWhere } }),
    // Shows recorded BOTH ways: counted once, not twice.
    showIds.length
      ? prisma.watchedItem.count({ where: { userId, mediaType: 'SHOW', tmdbId: { in: showIds }, ...yearWhere } })
      : Promise.resolve(0),
    prisma.watchedItem.findMany({
      where: { userId, ...yearWhere },
      take: scan,
      orderBy: { watchedAt: 'desc' },
    }),
    showIds.length
      ? prisma.filmMeta.findMany({
          where: { tmdbId: { in: showIds } },
          select: { tmdbId: true, episodeCount: true, showStatus: true },
        })
      : Promise.resolve([]),
  ]);

  const merged = new Map<string, WatchedRow>();
  for (const item of items) {
    merged.set(item.tmdbId, {
      tmdbId: item.tmdbId,
      mediaType: item.mediaType as 'MOVIE' | 'SHOW',
      watchedAt: item.watchedAt,
    });
  }

  const metaById = new Map(showMeta.map(m => [m.tmdbId, m]));
  for (const group of episodeGroups) {
    const meta = metaById.get(group.showTmdbId);
    const total = meta?.episodeCount ?? 0;
    const watchedEpisodes = group._count._all;
    const lastEpisodeAt = group._max.watchedAt ?? new Date(0);
    const existing = merged.get(group.showTmdbId);
    merged.set(group.showTmdbId, {
      tmdbId: group.showTmdbId,
      mediaType: 'SHOW',
      // A show marked whole and then watched through has two dates; the row
      // belongs at the later one, so it rises as you watch.
      watchedAt: existing && existing.watchedAt > lastEpisodeAt ? existing.watchedAt : lastEpisodeAt,
      watchedEpisodes,
      totalEpisodes: total,
      status: statusFor(watchedEpisodes, total, meta?.showStatus ?? undefined),
    });
  }

  const rows = [...merged.values()].sort((a, b) => b.watchedAt.getTime() - a.watchedAt.getTime());
  const start = (page - 1) * limit;

  return {
    rows: rows.slice(start, start + limit),
    total: itemTotal - overlap + showIds.length,
  };
}

/**
 * Films and shows counted separately, the way every list now presents them.
 * A profile showing one mixed number says nothing once the list it opens is
 * split in two, so the profile answers both instead of neither.
 *
 * A show is one row whether it was marked whole, ticked episode by episode, or
 * both — matching what the Shows side of the list actually shows.
 */
export async function countWatchedSplit(
  userId: string,
  { year }: { year?: number } = {},
): Promise<{ films: number; shows: number }> {
  const yearWhere = year
    ? { watchedAt: { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) } }
    : {};

  const [films, showItems, episodeShows] = await Promise.all([
    prisma.watchedItem.count({ where: { userId, mediaType: 'MOVIE', ...yearWhere } }),
    prisma.watchedItem.findMany({
      where: { userId, mediaType: 'SHOW', ...yearWhere },
      select: { tmdbId: true },
    }),
    prisma.watchedEpisode.groupBy({ by: ['showTmdbId'], where: { userId, ...yearWhere } }),
  ]);

  const shows = new Set(showItems.map(s => s.tmdbId));
  for (const g of episodeShows) shows.add(g.showTmdbId);

  return { films, shows: shows.size };
}

/**
 * How many rows that history has, counted the same way it's listed — one per
 * show rather than one per episode, so the profile's number matches its list.
 */
export async function countWatchedRows(userId: string, { year }: { year?: number } = {}): Promise<number> {
  const yearWhere = year
    ? { watchedAt: { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) } }
    : {};

  const showIds = (await prisma.watchedEpisode.groupBy({
    by: ['showTmdbId'],
    where: { userId, ...yearWhere },
  })).map(g => g.showTmdbId);

  const [itemTotal, overlap] = await Promise.all([
    prisma.watchedItem.count({ where: { userId, ...yearWhere } }),
    showIds.length
      ? prisma.watchedItem.count({ where: { userId, mediaType: 'SHOW', tmdbId: { in: showIds }, ...yearWhere } })
      : Promise.resolve(0),
  ]);

  return itemTotal - overlap + showIds.length;
}
