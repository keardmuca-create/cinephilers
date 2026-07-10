import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';
import { clampInt } from '@/lib/query-params';

export async function GET(req: NextRequest) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (q.length < 1) return ok([]);

  const limit = clampInt(req.nextUrl.searchParams.get('limit'), 10, 1, 20);

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
      // Pending follow request from the caller (private accounts) — the
      // Find People button must show "Requested", not "Follow"/"Following".
      receivedRequests: {
        where: { requesterId: auth.sub },
        select: { id: true },
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
    isRequested: u.receivedRequests.length > 0,
  }));

  return ok(result);
}
