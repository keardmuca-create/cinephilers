import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';

export interface FeedItem {
  id: string;
  type: 'watched' | 'rated' | 'reviewed' | 'imported';
  user: { id: string; username: string; displayName: string | null; avatarUrl: string | null };
  tmdbId: string;
  mediaType: string;
  rating?: number;
  reviewBody?: string;
  containsSpoiler?: boolean;
  importPlatform?: string;
  importCount?: number;
  createdAt: string;
}

export async function GET(req: NextRequest) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  const limit = Math.min(100, parseInt(req.nextUrl.searchParams.get('limit') ?? '50', 10));
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
  const [watched, ratings, reviews, imports] = await Promise.all([
    prisma.watchedItem.findMany({
      where: { userId: { in: followingIds }, watchedAt: { gte: since } },
      take: limit,
      orderBy: { watchedAt: 'desc' },
      include: { user: userSelect },
    }),
    prisma.rating.findMany({
      where: { userId: { in: followingIds }, updatedAt: { gte: since } },
      take: limit,
      orderBy: { updatedAt: 'desc' },
      include: { user: userSelect },
    }),
    prisma.review.findMany({
      where: { userId: { in: followingIds }, createdAt: { gte: since } },
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

  return ok(visible.slice(0, limit));
}
