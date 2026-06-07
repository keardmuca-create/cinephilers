import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';

export async function GET(req: NextRequest) {
  const tmdbId = req.nextUrl.searchParams.get('tmdbId');
  if (!tmdbId) return err('tmdbId required', 400);

  const auth = await getCurrentUser(req);

  const reviews = await prisma.review.findMany({
    where: { tmdbId },
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

  const result = reviews.map(r => ({
    id: r.id,
    user: r.user,
    body: r.body,
    containsSpoiler: r.containsSpoiler,
    rating: ratingMap.get(r.userId) ?? null,
    createdAt: r.createdAt.toISOString(),
    isOwn: auth ? r.userId === auth.sub : false,
  }));

  return ok(result);
}
