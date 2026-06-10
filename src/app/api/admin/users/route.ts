import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { verifyAccessToken } from '@/lib/auth-utils';

export const dynamic = 'force-dynamic';

const ADMIN_IDS = new Set(['0e4f66de-b8f9-4d0b-b176-ad31a788fd1e']);

async function requireAdmin() {
  const jar = await cookies();
  const token = jar.get('access_token')?.value ?? null;
  if (!token) return { auth: null, status: 'unauthenticated' as const };
  const auth = await verifyAccessToken(token);
  if (!auth) return { auth: null, status: 'unauthenticated' as const };
  if (ADMIN_IDS.has(auth.sub)) return { auth, status: 'ok' as const };
  const user = await prisma.user.findUnique({ where: { id: auth.sub }, select: { role: true } });
  if (user?.role !== 'ADMIN') return { auth: null, status: 'forbidden' as const };
  return { auth, status: 'ok' as const };
}

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

  await prisma.user.delete({ where: { id: userId } });
  return ok(null, 'User deleted');
}
