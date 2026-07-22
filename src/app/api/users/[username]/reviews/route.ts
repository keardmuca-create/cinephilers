import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { paginated, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';
import { clampInt } from '@/lib/query-params';

export async function GET(req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const { searchParams } = new URL(req.url);
  const page = clampInt(searchParams.get('page'), 1, 1, 1_000_000);
  const limit = clampInt(searchParams.get('limit'), 10, 1, 50);

  const user = await prisma.user.findUnique({ where: { username: username.toLowerCase() }, select: { id: true, isPrivate: true } });
  if (!user) return err('User not found', 404);

  if (user.isPrivate) {
    const auth = await getCurrentUser(req);
    const isOwner = auth?.sub === user.id;
    if (!isOwner) {
      if (!auth) return err('This account is private', 403);
      const follow = await prisma.follow.findUnique({ where: { followerId_followingId: { followerId: auth.sub, followingId: user.id } } });
      if (!follow) return err('This account is private', 403);
    }
  }

  const [total, items] = await Promise.all([
    prisma.review.count({ where: { userId: user.id, hidden: false } }),
    prisma.review.findMany({
      where: { userId: user.id, hidden: false },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  // Attach the author's rating for each reviewed title, so the review card can
  // show the star score alongside the text (helps others decide).
  const ratings = items.length > 0
    ? await prisma.rating.findMany({
        where: { userId: user.id, tmdbId: { in: [...new Set(items.map(r => r.tmdbId))] } },
        select: { tmdbId: true, mediaType: true, score: true },
      })
    : [];
  const scoreMap = new Map(ratings.map(r => [`${r.tmdbId}:${r.mediaType}`, r.score]));
  const withScore = items.map(r => ({ ...r, score: scoreMap.get(`${r.tmdbId}:${r.mediaType}`) ?? null }));

  return paginated(withScore, page, limit, total);
}
