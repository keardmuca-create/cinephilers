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

  // Follow-request notifications outlive the request row (accepting/denying
  // deletes it), so compute each one's LIVE status — otherwise the card shows
  // Accept/Deny forever and pressing them 404s against the deleted request.
  const requestNotifs = notifications.filter(n => n.type === 'follow_request');
  const [pendingRequests, acceptedFollows] = requestNotifs.length === 0
    ? [[], []]
    : await Promise.all([
        prisma.followRequest.findMany({
          where: { id: { in: requestNotifs.map(n => n.refId).filter((r): r is string => !!r) } },
          select: { id: true },
        }),
        prisma.follow.findMany({
          where: { followingId: auth.sub, followerId: { in: requestNotifs.map(n => n.fromId) } },
          select: { followerId: true },
        }),
      ]);
  const pendingIds = new Set(pendingRequests.map(r => r.id));
  const acceptedFromIds = new Set(acceptedFollows.map(f => f.followerId));
  const requestStatus = (n: { refId: string | null; fromId: string }) =>
    n.refId && pendingIds.has(n.refId) ? 'pending' : acceptedFromIds.has(n.fromId) ? 'accepted' : 'denied';

  const result = notifications.map(n => ({
    id: n.id,
    type: n.type,
    refId: n.refId,
    read: n.read,
    createdAt: n.createdAt,
    ...(n.type === 'follow_request' ? { requestStatus: requestStatus(n) } : {}),
    from: {
      username: n.from.username,
      displayName: n.from.displayName,
      avatarUrl: n.from.avatarUrl,
      isFollowingBack: n.from.followers.length > 0,
    },
  }));

  return ok({ notifications: result, unreadCount });
}
