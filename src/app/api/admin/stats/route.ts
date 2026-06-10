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

export async function GET() {
  const { status } = await requireAdmin();
  if (status === 'unauthenticated') return err('Unauthorized', 401);
  if (status === 'forbidden') return err('Forbidden', 403);

  const [totalUsers, bannedUsers, totalRatings, totalReviews, totalWatched] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isBanned: true } }),
    prisma.rating.count(),
    prisma.review.count(),
    prisma.watchedItem.count(),
  ]);

  return ok({ totalUsers, bannedUsers, totalRatings, totalReviews, totalWatched });
}
