import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { paginated, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';

export async function GET(req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '20', 10));

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
    prisma.watchedItem.count({ where: { userId: user.id } }),
    prisma.watchedItem.findMany({
      where: { userId: user.id },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { watchedAt: 'desc' },
    }),
  ]);

  return paginated(items, page, limit, total);
}
