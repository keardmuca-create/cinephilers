import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { writeLimit } from '@/lib/write-limit';
import { requireAdmin } from '@/lib/admin-auth';
import { recomputeMovieRatings } from '@/lib/movie-rating-sync';
import { writeAudit } from '@/lib/audit';

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
  const limited = await writeLimit(req, auth?.sub);
  if (limited) return limited;
  if (status === 'unauthenticated') return err('Unauthorized', 401);
  if (status === 'forbidden' || !auth) return err('Forbidden', 403);

  const { userId, action } = await req.json().catch(() => ({}));
  if (!userId || !action) return err('Missing userId or action', 400);
  if (userId === auth.sub) return err('Cannot modify your own account', 400);

  // Read once, before the change, so the audit row can name the target and — for
  // a role change — say what the role actually changed FROM. After the update
  // that answer is gone.
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true, role: true },
  });
  if (!target) return err('User not found', 404);

  if (action === 'ban') {
    await prisma.user.update({ where: { id: userId }, data: { isBanned: true } });
    await writeAudit({
      action: 'USER_BANNED',
      actorId: auth.sub,
      actorUsername: auth.username,
      targetId: userId,
      targetLabel: target.username,
    }, req);
    return ok(null, 'User banned');
  }
  if (action === 'unban') {
    await prisma.user.update({ where: { id: userId }, data: { isBanned: false } });
    await writeAudit({
      action: 'USER_UNBANNED',
      actorId: auth.sub,
      actorUsername: auth.username,
      targetId: userId,
      targetLabel: target.username,
    }, req);
    return ok(null, 'User unbanned');
  }
  if (action === 'promote' || action === 'demote') {
    const role = action === 'promote' ? 'ADMIN' : 'USER';
    await prisma.user.update({ where: { id: userId }, data: { role } });
    await writeAudit({
      action: 'USER_ROLE_CHANGED',
      actorId: auth.sub,
      actorUsername: auth.username,
      targetId: userId,
      targetLabel: target.username,
      details: { from: target.role, to: role },
    }, req);
    return ok(null, action === 'promote' ? 'User promoted to admin' : 'User demoted to user');
  }

  return err('Unknown action', 400);
}

export async function DELETE(req: NextRequest) {
  const { auth, status } = await requireAdmin();
  const limited = await writeLimit(req, auth?.sub);
  if (limited) return limited;
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

  // The username has to be read before the delete or the audit row records an
  // id that from this moment on resolves to nothing.
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true },
  });

  await prisma.user.delete({ where: { id: userId } });
  await recomputeMovieRatings(ratedTitles);

  await writeAudit({
    action: 'USER_DELETED',
    actorId: auth.sub,
    actorUsername: auth.username,
    targetId: userId,
    targetLabel: target?.username ?? null,
    // The username stays because a log naming a bare uuid is unreadable. The
    // EMAIL deliberately does not: an account that has been erased should not
    // leave its address behind in a table kept indefinitely.
    details: { ratedTitles: ratedTitles.length },
  }, req);

  return ok(null, 'User deleted');
}
