import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';

export async function POST(req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  const { username } = await params;
  const target = await prisma.user.findUnique({
    where: { username: username.toLowerCase() },
    select: { id: true, isPrivate: true },
  });
  if (!target) return err('User not found', 404);
  if (target.id === auth.sub) return err('Cannot follow yourself');

  if (target.isPrivate) {
    const existingRequest = await prisma.followRequest.findUnique({
      where: { requesterId_targetId: { requesterId: auth.sub, targetId: target.id } },
    });
    if (!existingRequest) {
      const request = await prisma.followRequest.create({
        data: { requesterId: auth.sub, targetId: target.id },
      });
      await prisma.notification.create({
        data: { userId: target.id, fromId: auth.sub, type: 'follow_request', refId: request.id },
      }).catch(() => {});
    }
    return ok({ requested: true }, 'Follow request sent');
  }

  const existing = await prisma.follow.findUnique({
    where: { followerId_followingId: { followerId: auth.sub, followingId: target.id } },
  });

  if (!existing) {
    await prisma.$transaction([
      prisma.follow.create({ data: { followerId: auth.sub, followingId: target.id } }),
      prisma.notification.create({ data: { userId: target.id, fromId: auth.sub, type: 'follow' } }),
    ]);
  }

  return ok(null, 'Followed');
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  const { username } = await params;
  const target = await prisma.user.findUnique({ where: { username: username.toLowerCase() }, select: { id: true } });
  if (!target) return err('User not found', 404);

  await Promise.all([
    prisma.follow.deleteMany({ where: { followerId: auth.sub, followingId: target.id } }),
    prisma.followRequest.deleteMany({ where: { requesterId: auth.sub, targetId: target.id } }),
  ]);

  return ok(null, 'Unfollowed');
}
