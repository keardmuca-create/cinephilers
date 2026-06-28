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

  let failed = 0;
  const watchedData: { userId: string; tmdbId: string; mediaType: 'MOVIE' | 'SHOW'; watchedAt: Date }[] = [];
  const watchlistData: { userId: string; tmdbId: string; mediaType: 'MOVIE' | 'SHOW' }[] = [];
  const ratingData: { userId: string; tmdbId: string; mediaType: 'MOVIE' | 'SHOW'; score: number }[] = [];
  const reviewData: { userId: string; tmdbId: string; mediaType: 'MOVIE' | 'SHOW'; body: string; containsSpoiler: boolean }[] = [];

  // Collect rows first, then bulk-insert each table in one round-trip below. The old
  // per-item create loop fired up to ~4 awaited queries per film (thousands for a big
  // Letterboxd library), which is slow and burns Fluid active-CPU; batching cuts it to
  // four inserts total.
  for (const item of items) {
    const key = `${item.tmdbId}:${item.mediaType}`;

    if (item.watchedAt && !hasWatched.has(key)) {
      const watchedAt = new Date(item.watchedAt);
      if (Number.isNaN(watchedAt.getTime())) failed++;
      else watchedData.push({ userId, tmdbId: item.tmdbId, mediaType: item.mediaType, watchedAt });
    }

    if (item.inWatchlist && !hasWatchlist.has(key)) {
      watchlistData.push({ userId, tmdbId: item.tmdbId, mediaType: item.mediaType });
    }

    // Rating — only accept whole numbers 1-10
    if (item.rating != null && !hasRating.has(key)) {
      if (!Number.isInteger(item.rating) || item.rating < 1 || item.rating > 10) failed++;
      else ratingData.push({ userId, tmdbId: item.tmdbId, mediaType: item.mediaType, score: item.rating });
    }

    if (item.review && item.review.trim().length >= 10 && !hasReview.has(key)) {
      reviewData.push({ userId, tmdbId: item.tmdbId, mediaType: item.mediaType, body: sanitizeText(item.review).slice(0, 5000), containsSpoiler: false });
    }
  }

  // skipDuplicates guards against any (userId, tmdbId, mediaType) collision the
  // pre-filter missed (e.g. duplicate rows within the uploaded file itself).
  const [watchedRes, watchlistRes, ratingRes, reviewRes] = await Promise.all([
    watchedData.length ? prisma.watchedItem.createMany({ data: watchedData, skipDuplicates: true }) : Promise.resolve({ count: 0 }),
    watchlistData.length ? prisma.watchlistItem.createMany({ data: watchlistData, skipDuplicates: true }) : Promise.resolve({ count: 0 }),
    ratingData.length ? prisma.rating.createMany({ data: ratingData, skipDuplicates: true }) : Promise.resolve({ count: 0 }),
    reviewData.length ? prisma.review.createMany({ data: reviewData, skipDuplicates: true }) : Promise.resolve({ count: 0 }),
  ]);

  const watchedAdded = watchedRes.count;
  const watchlistAdded = watchlistRes.count;
  const ratingsAdded = ratingRes.count;
  const reviewsAdded = reviewRes.count;

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

  return ok({ watchedAdded, ratingsAdded, watchlistAdded, reviewsAdded, failed });
}
