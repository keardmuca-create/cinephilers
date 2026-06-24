import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';

export async function GET(req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const auth = await getCurrentUser(req);

  const user = await prisma.user.findUnique({ where: { username: username.toLowerCase() }, select: { id: true, isPrivate: true } });
  if (!user) return err('User not found', 404);

  const isOwner = auth?.sub === user.id;

  if (user.isPrivate && !isOwner) {
    if (!auth) return err('This account is private', 403);
    const follow = await prisma.follow.findUnique({ where: { followerId_followingId: { followerId: auth.sub, followingId: user.id } } });
    if (!follow) return err('This account is private', 403);
  }

  const limitParam = req.nextUrl.searchParams.get('limit');
  const take = limitParam ? Math.min(100, parseInt(limitParam, 10)) : undefined;
  const lists = await prisma.customList.findMany({
    where: { userId: user.id, ...(isOwner ? {} : { isPublic: true }) },
    orderBy: { createdAt: 'desc' },
    ...(take ? { take } : {}),
    include: {
      items: {
        orderBy: { addedAt: 'asc' },
        select: { tmdbId: true, title: true, poster: true, year: true, mediaType: true },
      },
    },
  });

  return ok(lists);
}
