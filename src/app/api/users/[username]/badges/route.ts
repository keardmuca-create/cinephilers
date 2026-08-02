import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';
import { getBadges } from '@/lib/badge-compute';

export async function GET(req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;

  const user = await prisma.user.findUnique({
    where: { username: username.toLowerCase() },
    select: { id: true, isPrivate: true, createdAt: true },
  });
  if (!user) return err('User not found', 404);

  const auth = await getCurrentUser(req);
  const isOwner = auth?.sub === user.id;

  if (user.isPrivate && !isOwner) {
    if (!auth) return err('This account is private', 403);
    const follow = await prisma.follow.findUnique({ where: { followerId_followingId: { followerId: auth.sub, followingId: user.id } } });
    if (!follow) return err('This account is private', 403);
  }

  // Your own badges are always rebuilt, so rating something and opening your
  // profile shows the new number rather than a five-minute-old one. Everyone
  // else's come from the stored copy until it goes stale.
  const snapshot = await getBadges(user.id, { force: isOwner });

  return ok({
    earned: snapshot.badges,
    computedAt: snapshot.computedAt,
    // Founder's whole story is the date, so it rides along rather than being
    // squeezed into a count.
    memberSince: user.createdAt.toISOString(),
  });
}
