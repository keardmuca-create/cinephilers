import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';

export async function GET(req: NextRequest) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  const notifications = await prisma.notification.findMany({
    where: { userId: auth.sub },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      from: {
        select: {
          username: true,
          displayName: true,
          avatarUrl: true,
          followers: {
            where: { followerId: auth.sub },
            select: { followerId: true },
          },
        },
      },
    },
  });

  const unreadCount = notifications.filter(n => !n.read).length;

  const result = notifications.map(n => ({
    ...n,
    from: {
      username: n.from.username,
      displayName: n.from.displayName,
      avatarUrl: n.from.avatarUrl,
      isFollowingBack: n.from.followers.length > 0,
    },
  }));

  return ok({ notifications: result, unreadCount });
}
