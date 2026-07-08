import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { requireAdmin } from '@/lib/admin-auth';
import { recomputeMovieRatings } from '@/lib/movie-rating-sync';

export const dynamic = 'force-dynamic';

const USER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  email: true,
  role: true,
  isBanned: true,
  createdAt: true,
  reviewsCount: true,
  ratingsCount: true,
} as const;

export async function GET(req: NextRequest) {
  const { auth, status } = await requireAdmin();
  if (status === 'unauthenticated') return err('Unauthorized', 401);
  if (status === 'forbidden') return err('Forbidden', 403);

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';

  try {
    let users;
    if (q) {
      users = await prisma.user.findMany({
        where: {
          OR: [
            { username: { contains: q, mode: 'insensitive' } },
            { displayName: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: USER_SELECT,
        take: 20,
        orderBy: { createdAt: 'desc' },
      });
    } else {
      users = await prisma.user.findMany({
        select: USER_SELECT,
        take: 20,
        orderBy: { createdAt: 'desc' },
      });
    }
    return ok(users);
  } catch (e) {
    console.error('admin users GET error:', e);
    return err('Internal error', 500);
  }
}

export async function PATCH(req: NextRequest) {
  const { auth, status } = await requireAdmin();
  if (status === 'unauthenticated') return err('Unauthorized', 401);
  if (status === 'forbidden' || !auth) return err('Forbidden', 403);

  const { userId, action } = await req.json().catch(() => ({}));
  if (!userId || !action) return err('Missing userId or action', 400);
  if (userId === auth.sub) return err('Cannot modify your own account', 400);

  if (action === 'ban') {
    await prisma.user.update({ where: { id: userId }, data: { isBanned: true } });
    return ok(null, 'User banned');
  }
  if (action === 'unban') {
    await prisma.user.update({ where: { id: userId }, data: { isBanned: false } });
    return ok(null, 'User unbanned');
  }
  if (action === 'promote') {
    await prisma.user.update({ where: { id: userId }, data: { role: 'ADMIN' } });
    return ok(null, 'User promoted to admin');
  }
  if (action === 'demote') {
    await prisma.user.update({ where: { id: userId }, data: { role: 'USER' } });
    return ok(null, 'User demoted to user');
  }

  return err('Unknown action', 400);
}

export async function DELETE(req: NextRequest) {
  const { auth, status } = await requireAdmin();
  if (status === 'unauthenticated') return err('Unauthorized', 401);
  if (status === 'forbidden' || !auth) return err('Forbidden', 403);

  const { userId } = await req.json().catch(() => ({}));
  if (!userId) return err('Missing userId');

  if (userId === auth.sub) return err('Cannot delete your own account', 400);

  // The cascade wipes the user's ratings — capture which titles they voted on
  // first, then pull those votes back out of the Cinephilers aggregates so a
  // deleted account leaves no ghost votes in any score.
  const ratedTitles = await prisma.rating.findMany({
    where: { userId },
    select: { tmdbId: true, mediaType: true },
  });

  await prisma.user.delete({ where: { id: userId } });
  await recomputeMovieRatings(ratedTitles);

  return ok(null, 'User deleted');
}
