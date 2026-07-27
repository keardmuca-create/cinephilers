import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';
import { clampInt } from '@/lib/query-params';

export interface FeedItem {
  id: string;
  // 'activity' = a single film's watched + rated + reviewed folded into one card.
  // 'episode_batch' = 3+ episodes of one show on one day, folded together.
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
  const [watched, rewatches, ratings, reviews, imports, watchlist, dailyPicks] = await Promise.all([
    prisma.watchedItem.findMany({
      where: { userId: { in: followingIds }, watchedAt: { gte: since } },
      take: limit,
      orderBy: { watchedAt: 'desc' },
      include: { user: userSelect },
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
  // cards). Collapse per user per day: 1-2 adds show as normal "wants to see
  // this" cards (the invitational signal worth keeping), 3+ collapse into a
  // single "added N to watchlist" card. Import-time adds are excluded — the
  // "imported N titles" card already covers them.
  const wlByUserDay = new Map<string, typeof watchlist>();
  for (const w of watchlist) {
    if (nearImport(w.user.id, w.addedAt)) continue;
    const day = w.addedAt.toISOString().slice(0, 10);
    const key = `${w.user.id}:${day}`;
    const arr = wlByUserDay.get(key) ?? [];
    arr.push(w);
    wlByUserDay.set(key, arr);
  }
  const watchlistItems: FeedItem[] = [];
  for (const [key, rows] of wlByUserDay) {
    const sorted = rows.slice().sort((a, b) => b.addedAt.getTime() - a.addedAt.getTime());
    if (sorted.length <= 2) {
      for (const w of sorted) {
        watchlistItems.push({
          id: `watchlist-${w.id}`,
          type: 'watchlist',
          user: w.user,
          tmdbId: w.tmdbId,
          mediaType: w.mediaType,
          createdAt: w.addedAt.toISOString(),
        });
      }
    } else {
      watchlistItems.push({
        id: `watchlist-batch-${key}`,
        type: 'watchlist_batch',
        user: sorted[0].user,
        tmdbId: '',
        mediaType: '',
        batchCount: sorted.length,
        batchTmdbIds: sorted.slice(0, 6).map(w => w.tmdbId),
        createdAt: sorted[0].addedAt.toISOString(),
      });
    }
  }

  // Fold each film's watched + rated + reviewed by the same user into ONE
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
  // user's episodes of the SAME show on the SAME day once there are 3+, the
  // same rule the watchlist burst uses. One or two still show individually.
  const isEpisode = (id: string) => /^tmdb-tv-\d{1,10}-S\d{1,3}E\d{1,4}$/.test(id);
  const showOf = (id: string) => id.replace(/-S\d{1,3}E\d{1,4}$/, '');

  const activityItems: FeedItem[] = [];
  const epGroups = new Map<string, Acc[]>();
  for (const a of activityMap.values()) {
    if (!isEpisode(a.tmdbId)) { activityItems.push(toActivityItem(a)); continue; }
    const day = new Date(a.latest).toISOString().slice(0, 10);
    const k = `${a.user.id}:${showOf(a.tmdbId)}:${day}`;
    const arr = epGroups.get(k) ?? [];
    arr.push(a);
    epGroups.set(k, arr);
  }
  for (const group of epGroups.values()) {
    if (group.length < 3) { for (const a of group) activityItems.push(toActivityItem(a)); continue; }
    const sorted = group.slice().sort((a, b) => b.latest - a.latest);
    const first = sorted[0];
    activityItems.push({
      id: `episode-batch-${first.user.id}-${showOf(first.tmdbId)}-${new Date(first.latest).toISOString().slice(0, 10)}`,
      type: 'episode_batch',
      user: first.user,
      // The SHOW id, so the card resolves the show's poster and title.
      tmdbId: showOf(first.tmdbId),
      mediaType: first.mediaType,
      batchCount: group.length,
      batchTmdbIds: sorted.slice(0, 6).map(a => a.tmdbId),
      watched: group.some(a => a.watched),
      batchRated: group.filter(a => a.rating !== undefined).length,
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
