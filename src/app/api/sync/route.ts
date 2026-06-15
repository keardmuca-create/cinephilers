import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';

export async function GET(req: NextRequest) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  const [ratings, watchlist, watched, reviews, favorites, lists, hidden] = await Promise.all([
    prisma.rating.findMany({ where: { userId: auth.sub }, select: { tmdbId: true, mediaType: true, score: true, updatedAt: true } }),
    prisma.watchlistItem.findMany({ where: { userId: auth.sub }, select: { tmdbId: true, mediaType: true } }),
    prisma.watchedItem.findMany({ where: { userId: auth.sub }, select: { tmdbId: true, mediaType: true, watchedAt: true } }),
    prisma.review.findMany({
      where: { userId: auth.sub },
      select: { tmdbId: true, mediaType: true, body: true, containsSpoiler: true, createdAt: true },
    }),
    prisma.favorite.findMany({ where: { userId: auth.sub }, select: { tmdbId: true, mediaType: true, addedAt: true }, orderBy: { addedAt: 'asc' } }),
    prisma.customList.findMany({
      where: { userId: auth.sub },
      orderBy: { createdAt: 'desc' },
      include: { items: { orderBy: { addedAt: 'asc' } } },
    }),
    prisma.hiddenActivity.findMany({ where: { userId: auth.sub }, select: { type: true, tmdbId: true } }),
  ]);

  return ok({ ratings, watchlist, watched, reviews, favorites, lists, hidden });
}
