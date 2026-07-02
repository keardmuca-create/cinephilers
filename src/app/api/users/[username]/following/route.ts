import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { paginated, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';
import { clampInt } from '@/lib/query-params';

export async function GET(req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const { searchParams } = new URL(req.url);
  const page = clampInt(searchParams.get('page'), 1, 1, 1_000_000);
  const limit = clampInt(searchParams.get('limit'), 20, 1, 50);

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
    prisma.follow.count({ where: { followerId: user.id } }),
    prisma.follow.findMany({
      where: { followerId: user.id },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        following: {
          select: {
            username: true,
            displayName: true,
            avatarUrl: true,
            isVerified: true,
            _count: { select: { followers: true } },
          },
        },
      },
    }),
  ]);

  return paginated(
    items.map(f => ({
      username: f.following.username,
      displayName: f.following.displayName,
      avatarUrl: f.following.avatarUrl,
      isVerified: f.following.isVerified,
      followersCount: f.following._count.followers,
    })),
    page, limit, total
  );
}
