import { prisma } from '@/lib/db';

// Whether `viewerSub` (the verified caller, or null if unauthenticated) may see
// `authorId`'s content. Public authors are visible to everyone; private authors
// only to themselves and confirmed followers. Mirrors the inline gate used by
// the users/[username]/* profile endpoints.
export async function canViewUserContent(viewerSub: string | null, authorId: string): Promise<boolean> {
  if (viewerSub === authorId) return true;
  const author = await prisma.user.findUnique({ where: { id: authorId }, select: { isPrivate: true } });
  if (!author) return false;
  if (!author.isPrivate) return true;
  if (!viewerSub) return false;
  const follow = await prisma.follow.findUnique({
    where: { followerId_followingId: { followerId: viewerSub, followingId: authorId } },
  });
  return follow !== null;
}
