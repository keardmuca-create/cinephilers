import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';
import { clampInt } from '@/lib/query-params';

export interface FeedItem {
  id: string;
  type: 'watched' | 'rewatched' | 'rated' | 'reviewed' | 'imported' | 'watchlist' | 'watchlist_batch';
  user: { id: string; username: string; displayName: string | null; avatarUrl: string | null };
  tmdbId: string;
  mediaType: string;
  rating?: number;
  reviewBody?: string;
  containsSpoiler?: boolean;
  importPlatform?: string;
  importCount?: number;
  // watchlist_batch: a burst of watchlist adds collapsed into one card
  batchCount?: number;
  batchTmdbIds?: string[];
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
  const [watched, rewatches, ratings, reviews, imports, watchlist] = await Promise.all([
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

  const items: FeedItem[] = [
    ...watchlistItems,
    ...watched
      .filter(w => !rewatchKeys.has(`${w.user.id}:${w.tmdbId}:${w.mediaType}`))
      .map(w => ({
        id: `watched-${w.id}`,
        type: 'watched' as const,
        user: w.user,
        tmdbId: w.tmdbId,
        mediaType: w.mediaType,
        createdAt: w.watchedAt.toISOString(),
      })),
    ...rewatches.map(r => ({
      id: `rewatched-${r.id}`,
      type: 'rewatched' as const,
      user: r.user,
      tmdbId: r.tmdbId,
      mediaType: r.mediaType,
      createdAt: r.createdAt.toISOString(),
    })),
    ...ratings
      .filter(r => !nearImport(r.user.id, r.updatedAt))
      .map(r => ({
        id: `rated-${r.id}`,
        type: 'rated' as const,
        user: r.user,
        tmdbId: r.tmdbId,
        mediaType: r.mediaType,
        rating: r.score,
        createdAt: r.updatedAt.toISOString(),
      })),
    ...reviews.filter(r => !nearImport(r.user.id, r.createdAt)).map(r => ({
      id: `reviewed-${r.id}`,
      type: 'reviewed' as const,
      user: r.user,
      tmdbId: r.tmdbId,
      mediaType: r.mediaType,
      reviewBody: r.body,
      containsSpoiler: r.containsSpoiler,
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
