import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { paginated, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';
import { clampInt } from '@/lib/query-params';

export async function GET(req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const { searchParams } = new URL(req.url);
  const page = clampInt(searchParams.get('page'), 1, 1, 1_000_000);
  const limit = clampInt(searchParams.get('limit'), 20, 1, 100);
  // ?year=YYYY restricts to titles watched in that calendar year.
  const year = clampInt(searchParams.get('year'), 0, 0, 9999);
  const yearWhere = year ? { watchedAt: { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) } } : {};

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
    prisma.watchedItem.count({ where: { userId: user.id, ...yearWhere } }),
    prisma.watchedItem.findMany({
      where: { userId: user.id, ...yearWhere },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { watchedAt: 'desc' },
    }),
  ]);

  // Attach the owner's own rating for each watched title on this page (one
  // bounded query over the page's ids) so the profile can show it inline.
  const ratings = items.length
    ? await prisma.rating.findMany({
        where: { userId: user.id, tmdbId: { in: items.map(i => i.tmdbId) } },
        select: { tmdbId: true, mediaType: true, score: true },
      })
    : [];
  const scoreMap = new Map(ratings.map(r => [`${r.tmdbId}:${r.mediaType}`, r.score]));
  const withScore = items.map(i => ({ ...i, score: scoreMap.get(`${i.tmdbId}:${i.mediaType}`) ?? null }));

  return paginated(withScore, page, limit, total);
}
