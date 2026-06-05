import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { paginated, err } from '@/lib/api-response';

export async function GET(req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(50, parseInt(searchParams.get('limit') ?? '20', 10));

  const user = await prisma.user.findUnique({ where: { username: username.toLowerCase() }, select: { id: true } });
  if (!user) return err('User not found', 404);

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
