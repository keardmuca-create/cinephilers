import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';

export async function GET(req: NextRequest) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  const tmdbId = req.nextUrl.searchParams.get('tmdbId');
  if (!tmdbId) return err('tmdbId required', 400);

  const following = await prisma.follow.findMany({
    where: { followerId: auth.sub },
    select: { followingId: true },
  });
  const followingIds = following.map(f => f.followingId);

  if (followingIds.length === 0) return ok([]);

  const userSelect = {
    select: { id: true, username: true, displayName: true, avatarUrl: true },
  };

  const [ratings, watched, reviews, watchlisted] = await Promise.all([
    prisma.rating.findMany({
      where: { userId: { in: followingIds }, tmdbId },
      include: { user: userSelect },
    }),
    prisma.watchedItem.findMany({
      where: { userId: { in: followingIds }, tmdbId },
      include: { user: userSelect },
    }),
    prisma.review.findMany({
      where: { userId: { in: followingIds }, tmdbId, hidden: false },
      include: { user: userSelect },
    }),
    prisma.watchlistItem.findMany({
      where: { userId: { in: followingIds }, tmdbId },
      include: { user: userSelect },
    }),
  ]);

  const map = new Map<string, {
    user: { id: string; username: string; displayName: string | null; avatarUrl: string | null };
    rating: number | null;
    watched: boolean;
    reviewed: boolean;
    inWatchlist: boolean;
  }>();

  const blank = (user: { id: string; username: string; displayName: string | null; avatarUrl: string | null }) =>
    ({ user, rating: null as number | null, watched: false, reviewed: false, inWatchlist: false });

  for (const w of watched) {
    map.set(w.userId, { ...blank(w.user), watched: true });
  }
  for (const r of ratings) {
    const entry = map.get(r.userId) ?? map.set(r.userId, blank(r.user)).get(r.userId)!;
    entry.rating = r.score;
  }
  for (const r of reviews) {
    const entry = map.get(r.userId) ?? map.set(r.userId, blank(r.user)).get(r.userId)!;
    entry.reviewed = true;
  }
  // Friends who saved it for later — they appear too, even with no other activity.
  for (const w of watchlisted) {
    const entry = map.get(w.userId) ?? map.set(w.userId, blank(w.user)).get(w.userId)!;
    entry.inWatchlist = true;
  }

  return ok(Array.from(map.values()));
}
