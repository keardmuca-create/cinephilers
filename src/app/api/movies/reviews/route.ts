import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';

export async function GET(req: NextRequest) {
  const tmdbId = req.nextUrl.searchParams.get('tmdbId');
  if (!tmdbId) return err('tmdbId required', 400);

  const auth = await getCurrentUser(req);

  // Respect account privacy: a private user's reviews are only visible to
  // themselves and their accepted followers — never to anonymous visitors or
  // non-followers. Their *rating* still counts toward the movie's aggregate
  // (ratings are anonymous in aggregate); hiding the review is what removes the
  // name-to-number link, matching the IMDb model.
  const reviews = await prisma.review.findMany({
    where: {
      tmdbId,
      OR: [
        { user: { isPrivate: false } },
        ...(auth
          ? [
              { userId: auth.sub },
              { user: { followers: { some: { followerId: auth.sub } } } },
            ]
          : []),
      ],
    },
    orderBy: { createdAt: 'desc' },
    include: {
      user: {
        select: { id: true, username: true, displayName: true, avatarUrl: true },
      },
    },
  });

  // Fetch the current user's rating for each reviewer so we can show it
  const reviewerIds = reviews.map(r => r.userId);
  const ratings = auth
    ? await prisma.rating.findMany({
        where: { userId: { in: reviewerIds }, tmdbId },
        select: { userId: true, score: true },
      })
    : [];
  const ratingMap = new Map(ratings.map(r => [r.userId, r.score]));

  const myLikes = auth
    ? await prisma.reviewLike.findMany({
        where: { userId: auth.sub, reviewId: { in: reviews.map(r => r.id) } },
        select: { reviewId: true },
      })
    : [];
  const myLikedIds = new Set(myLikes.map(l => l.reviewId));

  const result = reviews.map(r => ({
    id: r.id,
    user: r.user,
    body: r.body,
    containsSpoiler: r.containsSpoiler,
    rating: ratingMap.get(r.userId) ?? null,
    createdAt: r.createdAt.toISOString(),
    isOwn: auth ? r.userId === auth.sub : false,
    likesCount: r.likesCount,
    likedByMe: myLikedIds.has(r.id),
  }));

  return ok(result);
}
