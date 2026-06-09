import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';

export const dynamic = 'force-dynamic';

const ADMIN_IDS = new Set(['0e4f66de-b8f9-4d0b-b176-ad31a788fd1e']);

async function requireAdmin(req: NextRequest): Promise<{ auth: Awaited<ReturnType<typeof getCurrentUser>>; status: 'ok' | 'unauthenticated' | 'forbidden' }> {
  const auth = await getCurrentUser(req);
  if (!auth) return { auth: null, status: 'unauthenticated' };
  if (ADMIN_IDS.has(auth.sub)) return { auth, status: 'ok' };
  const user = await prisma.user.findUnique({ where: { id: auth.sub }, select: { role: true } });
  if (user?.role !== 'ADMIN') return { auth: null, status: 'forbidden' };
  return { auth, status: 'ok' };
}

const USER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  email: true,
  role: true,
  createdAt: true,
  reviewsCount: true,
  ratingsCount: true,
} as const;

export async function GET(req: NextRequest) {
  const { auth, status } = await requireAdmin(req);
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

export async function DELETE(req: NextRequest) {
  const { auth, status } = await requireAdmin(req);
  if (status === 'unauthenticated') return err('Unauthorized', 401);
  if (status === 'forbidden' || !auth) return err('Forbidden', 403);

  const { userId } = await req.json().catch(() => ({}));
  if (!userId) return err('Missing userId');

  if (userId === auth.sub) return err('Cannot delete your own account', 400);

  await prisma.user.delete({ where: { id: userId } });
  return ok(null, 'User deleted');
}
