import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';

export async function GET(req: NextRequest) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  const userId = auth.sub;
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);

  const [watched, ratings, reviewsCount] = await Promise.all([
    prisma.watchedItem.findMany({
      where: { userId },
      select: { mediaType: true, watchedAt: true },
      orderBy: { watchedAt: 'asc' },
    }),
    prisma.rating.findMany({
      where: { userId },
      select: { score: true },
    }),
    prisma.review.count({ where: { userId } }),
  ]);

  // Totals
  const totalWatched = watched.length;
  const totalMovies = watched.filter(w => w.mediaType === 'MOVIE').length;
  const totalShows = watched.filter(w => w.mediaType === 'SHOW').length;

  // This year
  const watchedThisYear = watched.filter(w => w.watchedAt >= yearStart).length;

  // Ratings
  const totalRatings = ratings.length;
  const avgScore = totalRatings > 0
    ? Math.round((ratings.reduce((sum, r) => sum + r.score, 0) / totalRatings) * 10) / 10
    : null;

  // Monthly activity — last 12 months
  const months: { month: string; count: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    const count = watched.filter(w => w.watchedAt >= d && w.watchedAt < end).length;
    months.push({ month: label, count });
  }

  return ok({
    totalWatched,
    totalMovies,
    totalShows,
    watchedThisYear,
    totalRatings,
    avgScore,
    reviewsCount,
    monthlyActivity: months,
  });
}
