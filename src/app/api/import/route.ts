import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { verifyAccessToken } from '@/lib/auth-utils';
import { awardBadgeIfEarned } from '@/lib/badge-service';
import { sanitizeText } from '@/lib/sanitize';
import { rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

interface ImportItem {
  tmdbId: string;
  mediaType: 'MOVIE' | 'SHOW';
  rating?: number;       // 1-10
  review?: string;       // text
  watchedAt?: string;    // ISO date string
  inWatchlist?: boolean;
}

export async function POST(req: NextRequest) {
  const jar = await cookies();
  const token = jar.get('access_token')?.value ?? null;
  if (!token) return err('Unauthorized', 401);
  const auth = await verifyAccessToken(token);
  if (!auth) return err('Unauthorized', 401);

  const { allowed, retryAfter } = await rateLimit(`import:${auth.sub}`, 3, 600_000);
  if (!allowed) return err(`Too many imports. Try again in ${retryAfter}s`, 429);

  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.items)) return err('Invalid payload');

  const items = body.items as ImportItem[];
  if (items.length === 0) return ok({ imported: 0 });
  if (items.length > 10000) return err('Too many items (max 10,000 per import)', 400);

  const userId = auth.sub;

  // Fetch existing data to skip duplicates
  const [existingRatings, existingWatched, existingWatchlist, existingReviews] = await Promise.all([
    prisma.rating.findMany({ where: { userId }, select: { tmdbId: true, mediaType: true } }),
    prisma.watchedItem.findMany({ where: { userId }, select: { tmdbId: true, mediaType: true } }),
    prisma.watchlistItem.findMany({ where: { userId }, select: { tmdbId: true, mediaType: true } }),
    prisma.review.findMany({ where: { userId }, select: { tmdbId: true, mediaType: true } }),
  ]);

  const hasRating = new Set(existingRatings.map(r => `${r.tmdbId}:${r.mediaType}`));
  const hasWatched = new Set(existingWatched.map(w => `${w.tmdbId}:${w.mediaType}`));
  const hasWatchlist = new Set(existingWatchlist.map(w => `${w.tmdbId}:${w.mediaType}`));
  const hasReview = new Set(existingReviews.map(r => `${r.tmdbId}:${r.mediaType}`));

  let watchedAdded = 0;
  let ratingsAdded = 0;
  let watchlistAdded = 0;
  let reviewsAdded = 0;

  for (const item of items) {
    const key = `${item.tmdbId}:${item.mediaType}`;

    // Watched
    if (item.watchedAt && !hasWatched.has(key)) {
      await prisma.watchedItem.create({
        data: { userId, tmdbId: item.tmdbId, mediaType: item.mediaType, watchedAt: new Date(item.watchedAt) },
      }).catch(() => {});
      watchedAdded++;
    }

    // Watchlist
    if (item.inWatchlist && !hasWatchlist.has(key)) {
      await prisma.watchlistItem.create({
        data: { userId, tmdbId: item.tmdbId, mediaType: item.mediaType },
      }).catch(() => {});
      watchlistAdded++;
    }

    // Rating
    if (item.rating && !hasRating.has(key)) {
      await prisma.rating.create({
        data: { userId, tmdbId: item.tmdbId, mediaType: item.mediaType, score: item.rating },
      }).catch(() => {});
      ratingsAdded++;
    }

    // Review
    if (item.review && item.review.trim().length >= 10 && !hasReview.has(key)) {
      const body = sanitizeText(item.review).slice(0, 5000);
      await prisma.review.create({
        data: { userId, tmdbId: item.tmdbId, mediaType: item.mediaType, body, containsSpoiler: false },
      }).catch(() => {});
      reviewsAdded++;
    }
  }

  // Recalculate counts from DB (source of truth after bulk insert)
  const [totalRatings, totalReviews] = await Promise.all([
    prisma.rating.count({ where: { userId } }),
    prisma.review.count({ where: { userId } }),
  ]);

  await prisma.user.update({
    where: { id: userId },
    data: { ratingsCount: totalRatings, reviewsCount: totalReviews },
  });

  // Award any newly earned badges
  await awardBadgeIfEarned(userId, totalRatings);

  return ok({ watchedAdded, ratingsAdded, watchlistAdded, reviewsAdded });
}
