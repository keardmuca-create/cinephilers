import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';
import { clampInt } from '@/lib/query-params';
import { splitBursts, countSides, dayKey, isEpisodeId, showOfEpisode, episodeIdOf, type FeedSide } from '@/lib/feed-groups';

export interface FeedItem {
  id: string;
  // 'activity' = a single title's watched + rated + reviewed folded into one card.
  // 'episode_batch' = 2+ episodes of one show on one day, folded together.
  type: 'activity' | 'rewatched' | 'imported' | 'watchlist' | 'watchlist_batch' | 'daily_pick' | 'episode_batch';
  user: { id: string; username: string; displayName: string | null; avatarUrl: string | null };
  tmdbId: string;
  mediaType: string;
  watched?: boolean;
  rating?: number;
  reviewBody?: string;
  containsSpoiler?: boolean;
  importPlatform?: string;
  importCount?: number;
  // watchlist_batch / episode_batch: a burst collapsed into one card
  batchCount?: number;
  batchTmdbIds?: string[];
  batchRated?: number; // episode_batch: how many of them were also rated
  // How many of the burst are movies, shows and episodes, so the card never says
  // one mixed number; and the UTC day it was counted in, which the full list uses.
  batchSides?: Record<FeedSide, number>;
  batchDay?: string;
  createdAt: string;
  likeCount?: number;
  likedByMe?: boolean;
}

export async function GET(req: NextRequest) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  const limit = clampInt(req.nextUrl.searchParams.get('limit'), 50, 1, 100);
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // last 30 days

  // Get the IDs of everyone the current user follows
  const following = await prisma.follow.findMany({
    where: { followerId: auth.sub },
    select: { followingId: true },
  });
  // Include the user's own activity alongside the people they follow
  const followingIds = [...following.map(f => f.followingId), auth.sub];

  const userSelect = {
    select: { id: true, username: true, displayName: true, avatarUrl: true },
  };

  // Activities the user removed from their own feed (hidden everywhere, on every device)
  const hidden = await prisma.hiddenActivity.findMany({
    where: { userId: auth.sub },
    select: { type: true, tmdbId: true },
  });
  const hiddenKeys = new Set(hidden.map(h => `${h.type}-${h.tmdbId}`));

  // Fetch recent activity from all tables in parallel
  const [watched, episodesWatched, rewatches, ratings, reviews, imports, watchlist, dailyPicks] = await Promise.all([
    prisma.watchedItem.findMany({
      where: { userId: { in: followingIds }, watchedAt: { gte: since } },
      take: limit,
      orderBy: { watchedAt: 'desc' },
      include: { user: userSelect },
    }),
    // Ticked episodes live in their own table, which the feed never read: an episode
    // only appeared once it was rated or reviewed, so a whole binge went unseen.
    // A far higher take than the rest, because a binge folds into one card per show
    // and day, and the card has to count all of it — marking a season at once is a
    // dozen rows landing together.
    prisma.watchedEpisode.findMany({
      where: { userId: { in: followingIds }, watchedAt: { gte: since } },
      take: 2000,
      orderBy: { watchedAt: 'desc' },
      select: { showTmdbId: true, season: true, episode: true, watchedAt: true, user: userSelect },
    }),
    // Ordered by createdAt (when logged), not watchedAt — a backdated rewatch
    // should surface now, not be buried weeks deep in the feed.
    prisma.watchEvent.findMany({
      where: { userId: { in: followingIds }, isRewatch: true, createdAt: { gte: since } },
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { user: userSelect },
    }),
    prisma.rating.findMany({
      where: { userId: { in: followingIds }, updatedAt: { gte: since } },
      take: limit,
      orderBy: { updatedAt: 'desc' },
      include: { user: userSelect },
    }),
    prisma.review.findMany({
      where: { userId: { in: followingIds }, createdAt: { gte: since }, hidden: false },
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { user: userSelect },
    }),
    prisma.importActivity.findMany({
      where: { userId: { in: followingIds }, createdAt: { gte: since } },
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { user: userSelect },
    }),
    // Higher take: a burst gets collapsed into one card, so we need to see the
    // whole burst to count it correctly.
    prisma.watchlistItem.findMany({
      where: { userId: { in: followingIds }, addedAt: { gte: since } },
      take: 200,
      orderBy: { addedAt: 'desc' },
      include: { user: userSelect },
    }),
    prisma.dailyPick.findMany({
      where: { userId: { in: followingIds }, createdAt: { gte: since } },
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { user: userSelect },
    }),
  ]);

  // A rewatch bumps the summary row's watchedAt, so the same viewing would
  // otherwise appear twice ("watched" + "rewatched"). The rewatch entry wins.
  const rewatchKeys = new Set(rewatches.map(r => `${r.user.id}:${r.tmdbId}:${r.mediaType}`));

  // A bulk import creates hundreds of Rating/Review rows in one moment. Those
  // must collapse into the single "imported N titles" card — not flood the
  // feed as individual entries. Drop rated/reviewed items whose timestamp
  // falls within 10 minutes of that user's own import event.
  const importTimes = new Map<string, number[]>();
  for (const i of imports) {
    const arr = importTimes.get(i.user.id) ?? [];
    arr.push(i.createdAt.getTime());
    importTimes.set(i.user.id, arr);
  }
  const nearImport = (userId: string, t: Date) => {
    const arr = importTimes.get(userId);
    return !!arr && arr.some(x => Math.abs(x - t.getTime()) < 10 * 60_000);
  };

  // Watchlist adds flood if broadcast one-by-one (a browsing session = a dozen
  // cards). Collapse per user per day: a single add shows as a normal "wants to
  // see this" card (the invitational signal worth keeping), two or more collapse
  // into one "added 12 movies · 3 shows to watchlist" card. Import-time adds are
  // excluded — the "imported N titles" card already covers them.
  const { singles: loneAdds, groups: addBursts } = splitBursts(
    watchlist.filter(w => !nearImport(w.user.id, w.addedAt)),
    w => `${w.user.id}:${dayKey(w.addedAt)}`,
  );
  const watchlistItems: FeedItem[] = [
    ...loneAdds.map(w => ({
      id: `watchlist-${w.id}`,
      type: 'watchlist' as const,
      user: w.user,
      tmdbId: w.tmdbId,
      mediaType: w.mediaType,
      createdAt: w.addedAt.toISOString(),
    })),
    ...addBursts.map(({ key, rows }) => {
      const sorted = rows.slice().sort((a, b) => b.addedAt.getTime() - a.addedAt.getTime());
      return {
        id: `watchlist-batch-${key}`,
        type: 'watchlist_batch' as const,
        user: sorted[0].user,
        tmdbId: '',
        mediaType: '',
        batchCount: sorted.length,
        batchTmdbIds: sorted.slice(0, 6).map(w => w.tmdbId),
        batchSides: countSides(sorted),
        batchDay: dayKey(sorted[0].addedAt),
        createdAt: sorted[0].addedAt.toISOString(),
      };
    }),
  ];

  // Fold each title's watched + rated + reviewed by the same user into ONE
  // "activity" card, so watching + rating + reviewing a film is a single entry
  // instead of three (the flood). Rewatches, watchlist, imports stay separate.
  type Acc = {
    user: { id: string; username: string; displayName: string | null; avatarUrl: string | null };
    tmdbId: string; mediaType: string;
    watched?: boolean; rating?: number; reviewBody?: string; containsSpoiler?: boolean;
    latest: number;
  };
  const activityMap = new Map<string, Acc>();
  const accKey = (uid: string, tmdbId: string, mt: string) => `${uid}:${tmdbId}:${mt}`;
  const bump = (a: Acc, t: Date) => { a.latest = Math.max(a.latest, t.getTime()); };

  for (const w of watched) {
    if (rewatchKeys.has(`${w.user.id}:${w.tmdbId}:${w.mediaType}`)) continue; // rewatch card owns it
    const k = accKey(w.user.id, w.tmdbId, w.mediaType);
    const a = activityMap.get(k) ?? { user: w.user, tmdbId: w.tmdbId, mediaType: w.mediaType, latest: 0 };
    a.watched = true; bump(a, w.watchedAt); activityMap.set(k, a);
  }
  // Episodes are SHOW rows under the episode's own id, the key a rating or review of
  // the same episode uses below — so ticking one and rating it make one card. The
  // import rule is the ratings' rule: rows stamped at an import are the import
  // card's, and an import's backdated rows fall outside the thirty days anyway.
  for (const e of episodesWatched) {
    if (nearImport(e.user.id, e.watchedAt)) continue;
    const tmdbId = episodeIdOf(e.showTmdbId, e.season, e.episode);
    if (rewatchKeys.has(`${e.user.id}:${tmdbId}:SHOW`)) continue; // rewatch card owns it
    const k = accKey(e.user.id, tmdbId, 'SHOW');
    const a = activityMap.get(k) ?? { user: e.user, tmdbId, mediaType: 'SHOW', latest: 0 };
    a.watched = true; bump(a, e.watchedAt); activityMap.set(k, a);
  }
  for (const r of ratings) {
    if (nearImport(r.user.id, r.updatedAt)) continue;
    const k = accKey(r.user.id, r.tmdbId, r.mediaType);
    const a = activityMap.get(k) ?? { user: r.user, tmdbId: r.tmdbId, mediaType: r.mediaType, latest: 0 };
    a.rating = r.score; bump(a, r.updatedAt); activityMap.set(k, a);
  }
  for (const r of reviews) {
    if (nearImport(r.user.id, r.createdAt)) continue;
    const k = accKey(r.user.id, r.tmdbId, r.mediaType);
    const a = activityMap.get(k) ?? { user: r.user, tmdbId: r.tmdbId, mediaType: r.mediaType, latest: 0 };
    a.reviewBody = r.body; a.containsSpoiler = r.containsSpoiler; bump(a, r.createdAt); activityMap.set(k, a);
  }
  const toActivityItem = (a: Acc): FeedItem => ({
    id: `activity-${a.user.id}-${a.tmdbId}-${a.mediaType}`,
    type: 'activity' as const,
    user: a.user,
    tmdbId: a.tmdbId,
    mediaType: a.mediaType,
    watched: a.watched,
    rating: a.rating,
    reviewBody: a.reviewBody,
    containsSpoiler: a.containsSpoiler,
    createdAt: new Date(a.latest).toISOString(),
  });

  // A binge is one card per episode, which buries everyone else. Collapse a
  // user's episodes of the SAME show on the SAME day once there are two or more,
  // the same rule the watchlist burst uses. A single episode still shows alone.
  const accs = [...activityMap.values()];
  const activityItems: FeedItem[] = accs.filter(a => !isEpisodeId(a.tmdbId)).map(toActivityItem);
  const { singles: loneEpisodes, groups: binges } = splitBursts(
    accs.filter(a => isEpisodeId(a.tmdbId)),
    a => `${a.user.id}:${showOfEpisode(a.tmdbId)}:${dayKey(new Date(a.latest))}`,
  );
  activityItems.push(...loneEpisodes.map(toActivityItem));
  for (const { rows } of binges) {
    const sorted = rows.slice().sort((a, b) => b.latest - a.latest);
    const first = sorted[0];
    const day = dayKey(new Date(first.latest));
    activityItems.push({
      id: `episode-batch-${first.user.id}-${showOfEpisode(first.tmdbId)}-${day}`,
      type: 'episode_batch',
      user: first.user,
      // The SHOW id, so the card resolves the show's poster and title.
      tmdbId: showOfEpisode(first.tmdbId),
      mediaType: first.mediaType,
      batchCount: rows.length,
      batchTmdbIds: sorted.slice(0, 6).map(a => a.tmdbId),
      watched: rows.some(a => a.watched),
      batchRated: rows.filter(a => a.rating !== undefined).length,
      batchSides: { movies: 0, shows: 0, episodes: rows.length },
      batchDay: day,
      createdAt: new Date(first.latest).toISOString(),
    });
  }

  const items: FeedItem[] = [
    ...watchlistItems,
    ...dailyPicks.map(p => ({
      id: `daily_pick-${p.id}`,
      type: 'daily_pick' as const,
      user: p.user,
      tmdbId: p.tmdbId,
      mediaType: p.mediaType,
      createdAt: p.createdAt.toISOString(),
    })),
    ...activityItems,
    ...rewatches.map(r => ({
      id: `rewatched-${r.id}`,
      type: 'rewatched' as const,
      user: r.user,
      tmdbId: r.tmdbId,
      mediaType: r.mediaType,
      createdAt: r.createdAt.toISOString(),
    })),
    ...imports.map(i => ({
      id: `imported-${i.id}`,
      type: 'imported' as const,
      user: i.user,
      tmdbId: '',
      mediaType: '',
      importPlatform: i.platform,
      importCount: i.count,
      createdAt: i.createdAt.toISOString(),
    })),
  ];

  // Drop the user's own activity they chose to hide from their feed
  const visible = hiddenKeys.size === 0
    ? items
    : items.filter(i => !(i.user.id === auth.sub && hiddenKeys.has(`${i.type}-${i.tmdbId}`)));

  // Sort merged items by recency and return top `limit`
  visible.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const top = visible.slice(0, limit);

  // Attach like counts + whether the caller liked each card. One batched query
  // over the page's (owner, tmdbId) pairs, matched to exact triples in JS.
  const likeable = top.filter(i => i.tmdbId && i.type !== 'imported');
  if (likeable.length > 0) {
    const likes = await prisma.activityLike.findMany({
      where: {
        targetId: { in: [...new Set(likeable.map(i => i.user.id))] },
        tmdbId: { in: [...new Set(likeable.map(i => i.tmdbId))] },
      },
      select: { targetId: true, type: true, tmdbId: true, userId: true },
    });
    const counts = new Map<string, number>();
    const mine = new Set<string>();
    for (const l of likes) {
      const k = `${l.targetId}:${l.type}:${l.tmdbId}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
      if (l.userId === auth.sub) mine.add(k);
    }
    for (const i of top) {
      const k = `${i.user.id}:${i.type}:${i.tmdbId}`;
      i.likeCount = counts.get(k) ?? 0;
      i.likedByMe = mine.has(k);
    }
  }

  return ok(top);
}
