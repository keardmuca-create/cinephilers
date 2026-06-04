import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';

export async function GET(req: NextRequest) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  const [ratings, watchlist, watched, reviews] = await Promise.all([
    prisma.rating.findMany({ where: { userId: auth.sub }, select: { tmdbId: true, mediaType: true, score: true } }),
    prisma.watchlistItem.findMany({ where: { userId: auth.sub }, select: { tmdbId: true, mediaType: true } }),
    prisma.watchedItem.findMany({ where: { userId: auth.sub }, select: { tmdbId: true, mediaType: true } }),
    prisma.review.findMany({
      where: { userId: auth.sub },
      select: { tmdbId: true, mediaType: true, body: true, containsSpoiler: true, createdAt: true },
    }),
  ]);

  return ok({ ratings, watchlist, watched, reviews });
}
