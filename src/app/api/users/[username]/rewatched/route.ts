import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';
import { clampInt } from '@/lib/query-params';

// Per-title diary aggregate: watch count + latest watch date per title. By
// default only titles watched 2+ times ("rewatched"); ?min=1 returns the whole
// diary. ?sort=recent orders by latest watch instead of count. Same privacy
// gate as the other users/[username]/* content endpoints.
export async function GET(req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const { searchParams } = new URL(req.url);
  const page = clampInt(searchParams.get('page'), 1, 1, 1_000_000);
  const limit = clampInt(searchParams.get('limit'), 20, 1, 100);
  const min = clampInt(searchParams.get('min'), 2, 1, 2);
  const sort = searchParams.get('sort') === 'recent' ? 'recent' : 'count';
  const dir = searchParams.get('dir') === 'asc' ? 'asc' : 'desc';

  const user = await prisma.user.findUnique({
    where: { username: username.toLowerCase() },
    select: { id: true, isPrivate: true },
  });
  if (!user) return err('User not found', 404);

  if (user.isPrivate) {
    const auth = await getCurrentUser(req);
    const isOwner = auth?.sub === user.id;
    if (!isOwner) {
      if (!auth) return err('This account is private', 403);
      const follow = await prisma.follow.findUnique({
        where: { followerId_followingId: { followerId: auth.sub, followingId: user.id } },
      });
      if (!follow) return err('This account is private', 403);
    }
  }

  const groups = await prisma.watchEvent.groupBy({
    by: ['tmdbId', 'mediaType'],
    where: { userId: user.id },
    _count: { _all: true },
    _max: { watchedAt: true },
    having: { tmdbId: { _count: { gte: min } } },
    orderBy: sort === 'recent'
      ? [{ _max: { watchedAt: dir } }, { _count: { tmdbId: 'desc' } }]
      : [{ _count: { tmdbId: dir } }, { _max: { watchedAt: 'desc' } }],
    skip: (page - 1) * limit,
    take: limit + 1, // one extra to know if there's a next page
  });

  const hasMore = groups.length > limit;
  const items = groups.slice(0, limit).map(g => ({
    tmdbId: g.tmdbId,
    mediaType: g.mediaType,
    count: g._count._all,
    lastWatchedAt: g._max.watchedAt,
  }));

  return ok({ items, page, limit, hasMore });
}
