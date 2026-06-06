import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';

export async function GET(req: NextRequest) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  const tmdbId = req.nextUrl.searchParams.get('tmdbId');
  if (!tmdbId) return err('tmdbId required', 400);

  // Get IDs of everyone the current user follows
  const following = await prisma.follow.findMany({
    where: { followerId: auth.sub },
    select: { followingId: true },
  });
  const followingIds = following.map(f => f.followingId);

  if (followingIds.length === 0) return ok([]);

  const userSelect = {
    select: { id: true, username: true, displayName: true, avatarUrl: true },
  };

  const [ratings, watched] = await Promise.all([
    prisma.rating.findMany({
      where: { userId: { in: followingIds }, tmdbId },
      include: { user: userSelect },
    }),
    prisma.watchedItem.findMany({
      where: { userId: { in: followingIds }, tmdbId },
      include: { user: userSelect },
    }),
  ]);

  // Build a map: userId -> { user, rating, watched }
  const map = new Map<string, {
    user: { id: string; username: string; displayName: string | null; avatarUrl: string | null };
    rating: number | null;
    watched: boolean;
  }>();

  for (const w of watched) {
    map.set(w.userId, { user: w.user, rating: null, watched: true });
  }
  for (const r of ratings) {
    const existing = map.get(r.userId);
    if (existing) {
      existing.rating = r.score;
    } else {
      map.set(r.userId, { user: r.user, rating: r.score, watched: false });
    }
  }

  const result = Array.from(map.values()).filter(e => e.rating !== null || e.watched);

  return ok(result);
}
