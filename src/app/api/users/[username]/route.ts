import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';

export async function GET(req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const auth = await getCurrentUser(req);

  const user = await prisma.user.findUnique({
    where: { username: username.toLowerCase() },
    select: {
      id: true, username: true, displayName: true, avatarUrl: true,
      bio: true, isPrivate: true, role: true, isVerified: true,
      ratingsCount: true, reviewsCount: true, createdAt: true,
      _count: { select: { followers: true, following: true, watched: true } },
    },
  });
  if (!user) return err('User not found', 404);

  const isOwner = auth?.sub === user.id;

  const [isFollowing, pendingRequest] = !isOwner && auth
    ? await Promise.all([
        prisma.follow.findUnique({ where: { followerId_followingId: { followerId: auth.sub, followingId: user.id } } }),
        prisma.followRequest.findUnique({ where: { requesterId_targetId: { requesterId: auth.sub, targetId: user.id } } }),
      ])
    : [null, null];

  const isFollowingBool = !!isFollowing;
  const isPendingRequest = !!pendingRequest;

  if (user.isPrivate && !isOwner && !isFollowingBool) {
    return ok({
      id: user.id, username: user.username, displayName: user.displayName,
      avatarUrl: user.avatarUrl, isPrivate: true, isPendingRequest,
    });
  }

  return ok({
    ...user,
    followersCount: user._count.followers,
    followingCount: user._count.following,
    watchedCount: user._count.watched,
    isFollowing: isFollowingBool,
    isPendingRequest,
    isOwner,
  });
}
