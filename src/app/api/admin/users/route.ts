import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';

const ADMIN_IDS = new Set(['0e4f66de-b8f9-4d0b-b176-ad31a788fd1e']);

async function requireAdmin(req: NextRequest) {
  const auth = await getCurrentUser(req);
  if (!auth) return null;
  if (ADMIN_IDS.has(auth.sub)) return auth;
  const user = await prisma.user.findUnique({ where: { id: auth.sub }, select: { role: true } });
  if (user?.role !== 'ADMIN') return null;
  return auth;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth) return err('Forbidden', 403);

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (!q) return ok([]);

  const users = await prisma.user.findMany({
    where: {
      OR: [
        { username: { contains: q, mode: 'insensitive' } },
        { displayName: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      email: true,
      role: true,
      createdAt: true,
      reviewsCount: true,
      ratingsCount: true,
    },
    take: 20,
    orderBy: { createdAt: 'desc' },
  });

  return ok(users);
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth) return err('Forbidden', 403);

  const { userId } = await req.json().catch(() => ({}));
  if (!userId) return err('Missing userId');

  // Prevent self-deletion
  if (userId === auth.sub) return err('Cannot delete your own account', 400);

  await prisma.user.delete({ where: { id: userId } });
  return ok(null, 'User deleted');
}
