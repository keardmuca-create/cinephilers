import { NextRequest } from 'next/server';
import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/db';
import { unverifiedWhere, verifiedOrGrandfatheredWhere } from '@/lib/email-verification';
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

const USERS_PAGE = 30;

export async function GET(req: NextRequest) {
  const { auth, status } = await requireAdmin();
  if (status === 'unauthenticated') return err('Unauthorized', 401);
  if (status === 'forbidden') return err('Forbidden', 403);

  const params = req.nextUrl.searchParams;
  const q = params.get('q')?.trim() ?? '';
  const cursor = params.get('cursor');

  // Two lists. "unverified" is every account that signed up after verification became
  // required and never clicked the link — they can't log in, and a bounced address
  // (a fake signup) stays here for good. "users" is everyone else. Same rule as login.
  const group = params.get('group') === 'unverified' ? unverifiedWhere() : verifiedOrGrandfatheredWhere();
  const where: Prisma.UserWhereInput = q
    ? {
        AND: [
          group,
          {
            OR: [
              { username: { contains: q, mode: 'insensitive' } },
              { displayName: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
            ],
          },
        ],
      }
    : group;

  try {
    // A page at a time, newest first, so the whole list is reachable by scrolling —
    // it used to stop at the 20 newest. id breaks ties between identical timestamps
    // so the cursor never skips or repeats a row.
    const rows = await prisma.user.findMany({
      where,
      select: USER_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: USERS_PAGE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > USERS_PAGE;
    const users = hasMore ? rows.slice(0, USERS_PAGE) : rows;

    // Both totals with the first page only; scrolling for more doesn't change them.
    const counts = cursor ? null : await Promise.all([
      prisma.user.count({ where: verifiedOrGrandfatheredWhere() }),
      prisma.user.count({ where: unverifiedWhere() }),
    ]).then(([usersTotal, unverifiedTotal]) => ({ users: usersTotal, unverified: unverifiedTotal }));

    return ok({ users, nextCursor: hasMore ? users[users.length - 1].id : null, counts });
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
