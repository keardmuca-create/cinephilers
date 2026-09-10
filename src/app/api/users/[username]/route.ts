import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';
import { countWatchedRows, countWatchedSplit } from '@/lib/watched-rows';
import { sideWhere } from '@/lib/media-side-where';

const SIDES = ['movies', 'shows', 'episodes'] as const;

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
  const [watchlistCount, listsCount, reviewsCount, watchedCount, rewatchGroups, rewatchThisYearGroups, ratingGroups, watchedSplit, ratingRows, watchlistSplit, reviewsSplit] = await Promise.all([
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
    prisma.rating.findMany({ where: { userId: user.id }, select: { tmdbId: true, mediaType: true, score: true } }),
    // Watchlist and reviews split three ways. An episode is filed under SHOW, so
    // grouping by mediaType alone counted every saved episode as a show.
    Promise.all(SIDES.map(side => prisma.watchlistItem.count({ where: { userId: user.id, ...sideWhere(side) } }))),
    Promise.all(SIDES.map(side => prisma.review.count({ where: { userId: user.id, hidden: false, ...sideWhere(side) } }))),
  ]);

  // 10 buckets, index 0 = score 1 … index 9 = score 10.
  const ratingDistribution = Array.from({ length: 10 }, (_, i) => ratingGroups.find(g => g.score === i + 1)?._count._all ?? 0);

  // Ratings split three ways, the way the lists show them. On the Shows side an
  // episode rating collapses into its show — rating 62 episodes is one show rated —
  // and on the Episodes side each counts. The chart draws every side from its own
  // scores: a series sits on the bar of the score given the SERIES, never on an
  // episode average, the same rule the owner's own chart follows.
  const ratedShows = new Set<string>();
  let ratedFilms = 0;
  let ratedEpisodes = 0;
  const buckets = () => Array.from({ length: 10 }, () => 0);
  const ratingDistributionBySide = { movies: buckets(), shows: buckets(), episodes: buckets() };
  for (const r of ratingRows) {
    const bucket = r.score >= 1 && r.score <= 10 ? r.score - 1 : -1;
    if (r.mediaType !== 'SHOW') {
      ratedFilms++;
      if (bucket >= 0) ratingDistributionBySide.movies[bucket]++;
      continue;
    }
    ratedShows.add(r.tmdbId.replace(/-S\d+E\d+$/, ''));
    if (/-S\d+E\d+$/.test(r.tmdbId)) {
      ratedEpisodes++;
      if (bucket >= 0) ratingDistributionBySide.episodes[bucket]++;
    } else if (bucket >= 0) {
      ratingDistributionBySide.shows[bucket]++;
    }
  }

  // Rewatched split the same three ways, off the id: an episode is filed under
  // SHOW with an -S1E2 id, a whole show under SHOW without one.
  const rewatched = { films: 0, shows: 0, episodes: 0 };
  for (const g of rewatchGroups) {
    if (g.mediaType !== 'SHOW') rewatched.films++;
    else if (/-S\d+E\d+$/.test(g.tmdbId)) rewatched.episodes++;
    else rewatched.shows++;
  }

  const [watchlistFilms, watchlistShows, watchlistEpisodes] = watchlistSplit;
  const [reviewsFilms, reviewsShows, reviewsEpisodes] = reviewsSplit;

  return ok({
    ...user,
    followersCount: user._count.followers,
    followingCount: user._count.following,
    watchedCount,
    watchedFilms: watchedSplit.films,
    watchedShows: watchedSplit.shows,
    watchedEpisodes: watchedSplit.episodes,
    ratedFilms,
    ratedShows: ratedShows.size,
    ratedEpisodes,
    watchlistFilms,
    watchlistShows,
    watchlistEpisodes,
    watchlistCount,
    rewatchedCount: rewatchGroups.length,
    rewatchedFilms: rewatched.films,
    rewatchedShows: rewatched.shows,
    rewatchedEpisodes: rewatched.episodes,
    listsCount,
    reviewsCount,
    reviewsFilms,
    reviewsShows,
    reviewsEpisodes,
    rewatchedThisYear: rewatchThisYearGroups.length,
    ratingDistribution,
    ratingDistributionBySide,
    isFollowing: isFollowingBool,
    isPendingRequest,
    isOwner,
  });
}
