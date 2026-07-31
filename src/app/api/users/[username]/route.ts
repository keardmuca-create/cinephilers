import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';
import { countWatchedRows, countWatchedSplit } from '@/lib/watched-rows';

export async function GET(req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const auth = await getCurrentUser(req);

  const user = await prisma.user.findUnique({
    where: { username: username.toLowerCase() },
    select: {
      id: true, username: true, displayName: true, avatarUrl: true,
      bio: true, isPrivate: true, role: true, isVerified: true,
      ratingsCount: true, reviewsCount: true, createdAt: true,
      _count: { select: { followers: true, following: true, watched: true } },
    },
  });
  if (!user) return err('User not found', 404);

  const isOwner = auth?.sub === user.id;

  const [isFollowing, pendingRequest] = !isOwner && auth
    ? await Promise.all([
        prisma.follow.findUnique({ where: { followerId_followingId: { followerId: auth.sub, followingId: user.id } } }),
        prisma.followRequest.findUnique({ where: { requesterId_targetId: { requesterId: auth.sub, targetId: user.id } } }),
      ])
    : [null, null];

  const isFollowingBool = !!isFollowing;
  const isPendingRequest = !!pendingRequest;

  if (user.isPrivate && !isOwner && !isFollowingBool) {
    return ok({
      id: user.id, username: user.username, displayName: user.displayName,
      avatarUrl: user.avatarUrl, isPrivate: true, isPendingRequest,
    });
  }

  // Row counts + this-year splits + the rating-distribution histogram for the
  // public profile. Only computed once the profile is known to be visible.
  const yearStart = new Date(new Date().getFullYear(), 0, 1);
  const thisYear = yearStart.getFullYear();
  const [watchlistCount, listsCount, reviewsCount, watchedCount, rewatchGroups, rewatchThisYearGroups, ratingGroups, watchedSplit, ratingRows, watchlistGroups] = await Promise.all([
    prisma.watchlistItem.count({ where: { userId: user.id } }),
    prisma.customList.count({ where: { userId: user.id, ...(isOwner ? {} : { isPublic: true }) } }),
    prisma.review.count({ where: { userId: user.id, hidden: false } }),
    // Counted per title, not per episode — the same way the list is built, so
    // the number on the row matches the list it opens. _count.watched would
    // count the WatchedItem table alone and miss ticked episodes entirely.
    countWatchedRows(user.id),
    prisma.watchEvent.groupBy({
      by: ['tmdbId', 'mediaType'],
      where: { userId: user.id },
      _count: { _all: true },
      having: { tmdbId: { _count: { gte: 2 } } },
    }),
    // Films watched 2+ times within this year ("rewatched this year") — same
    // definition the ?year= list uses, so the row count matches that view.
    prisma.watchEvent.groupBy({
      by: ['tmdbId', 'mediaType'],
      where: { userId: user.id, watchedAt: { gte: yearStart } },
      having: { tmdbId: { _count: { gte: 2 } } },
    }),
    prisma.rating.groupBy({ by: ['score'], where: { userId: user.id }, _count: { _all: true } }),
    // Films / shows split for the profile rows. Every list is split in two now,
    // so one mixed number on the row that opens them says nothing.
    countWatchedSplit(user.id),
    prisma.rating.findMany({ where: { userId: user.id }, select: { tmdbId: true, mediaType: true } }),
    prisma.watchlistItem.groupBy({ by: ['mediaType'], where: { userId: user.id }, _count: { _all: true } }),
  ]);

  // 10 buckets, index 0 = score 1 … index 9 = score 10.
  const ratingDistribution = Array.from({ length: 10 }, (_, i) => ratingGroups.find(g => g.score === i + 1)?._count._all ?? 0);

  // Ratings split. Episode ratings collapse into their show, matching the list —
  // rating 62 episodes is one show rated, not 62 things rated.
  const ratedShows = new Set<string>();
  let ratedFilms = 0;
  for (const r of ratingRows) {
    if (r.mediaType === 'SHOW') ratedShows.add(r.tmdbId.replace(/-S\d+E\d+$/, ''));
    else ratedFilms++;
  }

  // The watchlist deliberately does NOT collapse episodes — a saved episode is
  // its own intent there — so its shows side counts rows, episodes included.
  const watchlistFilms = watchlistGroups.find(g => g.mediaType === 'MOVIE')?._count._all ?? 0;
  const watchlistShows = watchlistGroups.find(g => g.mediaType === 'SHOW')?._count._all ?? 0;

  return ok({
    ...user,
    followersCount: user._count.followers,
    followingCount: user._count.following,
    watchedCount,
    watchedFilms: watchedSplit.films,
    watchedShows: watchedSplit.shows,
    ratedFilms,
    ratedShows: ratedShows.size,
    watchlistFilms,
    watchlistShows,
    watchlistCount,
    rewatchedCount: rewatchGroups.length,
    listsCount,
    reviewsCount,
    rewatchedThisYear: rewatchThisYearGroups.length,
    ratingDistribution,
    isFollowing: isFollowingBool,
    isPendingRequest,
    isOwner,
  });
}
