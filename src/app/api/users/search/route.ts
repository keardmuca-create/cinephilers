import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';

export async function GET(req: NextRequest) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (q.length < 1) return ok([]);

  const limit = Math.min(20, parseInt(req.nextUrl.searchParams.get('limit') ?? '10', 10));

  const users = await prisma.user.findMany({
    where: {
      AND: [
        { id: { not: auth.sub } },
        {
          OR: [
            { username: { contains: q, mode: 'insensitive' } },
            { displayName: { contains: q, mode: 'insensitive' } },
          ],
        },
      ],
    },
    take: limit,
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      isVerified: true,
      _count: { select: { followers: true, following: true } },
      followers: {
        where: { followerId: auth.sub },
        select: { followerId: true },
      },
    },
    orderBy: { ratingsCount: 'desc' },
  });

  const result = users.map(u => ({
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl,
    isVerified: u.isVerified,
    followersCount: u._count.followers,
    followingCount: u._count.following,
    isFollowing: u.followers.length > 0,
  }));

  return ok(result);
}
