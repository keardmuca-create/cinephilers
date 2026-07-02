import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { requireAdmin } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

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
