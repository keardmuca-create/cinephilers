import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';

export interface FeedItem {
  id: string;
  type: 'watched' | 'rated' | 'reviewed';
  user: { id: string; username: string; displayName: string | null; avatarUrl: string | null };
  tmdbId: string;
  mediaType: string;
  rating?: number;
  reviewBody?: string;
  containsSpoiler?: boolean;
  createdAt: string;
}

export async function GET(req: NextRequest) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  const limit = Math.min(50, parseInt(req.nextUrl.searchParams.get('limit') ?? '30', 10));

  // Get the IDs of everyone the current user follows
  const following = await prisma.follow.findMany({
    where: { followerId: auth.sub },
    select: { followingId: true },
  });
  const followingIds = following.map(f => f.followingId);

  if (followingIds.length === 0) return ok([]);

  const userSelect = {
    select: { id: true, username: true, displayName: true, avatarUrl: true },
  };

  // Fetch recent activity from all three tables in parallel
  const [watched, ratings, reviews] = await Promise.all([
    prisma.watchedItem.findMany({
      where: { userId: { in: followingIds } },
      take: limit,
      orderBy: { watchedAt: 'desc' },
      include: { user: userSelect },
    }),
    prisma.rating.findMany({
      where: { userId: { in: followingIds } },
      take: limit,
      orderBy: { updatedAt: 'desc' },
      include: { user: userSelect },
    }),
    prisma.review.findMany({
      where: { userId: { in: followingIds } },
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { user: userSelect },
    }),
  ]);

  const items: FeedItem[] = [
    ...watched.map(w => ({
      id: `watched-${w.id}`,
      type: 'watched' as const,
      user: w.user,
      tmdbId: w.tmdbId,
      mediaType: w.mediaType,
      createdAt: w.watchedAt.toISOString(),
    })),
    ...ratings.map(r => ({
      id: `rated-${r.id}`,
      type: 'rated' as const,
      user: r.user,
      tmdbId: r.tmdbId,
      mediaType: r.mediaType,
      rating: r.score,
      createdAt: r.updatedAt.toISOString(),
    })),
    ...reviews.map(r => ({
      id: `reviewed-${r.id}`,
      type: 'reviewed' as const,
      user: r.user,
      tmdbId: r.tmdbId,
      mediaType: r.mediaType,
      reviewBody: r.body,
      containsSpoiler: r.containsSpoiler,
      createdAt: r.createdAt.toISOString(),
    })),
  ];

  // Sort merged items by recency and return top `limit`
  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return ok(items.slice(0, limit));
}
