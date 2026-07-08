import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { verifyAccessToken } from '@/lib/auth-utils';
import { awardBadgeIfEarned } from '@/lib/badge-service';
import { sanitizeText } from '@/lib/sanitize';
import { rateLimit } from '@/lib/rate-limit';
import { canonicalId, isValidMediaId } from '@/lib/media-id';

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
    // Validate per row and skip bad ones — one malformed row must not 500 the
    // whole createMany, and unchecked ids/mediaTypes would pollute the DB (and
    // inflate ratingsCount/badges) with garbage entries.
    if (item.mediaType !== 'MOVIE' && item.mediaType !== 'SHOW') { failed++; continue; }
    const tmdbId = typeof item.tmdbId === 'string' ? canonicalId(item.tmdbId) : '';
    if (!isValidMediaId(tmdbId)) { failed++; continue; }

    const key = `${tmdbId}:${item.mediaType}`;

    if (item.watchedAt && !hasWatched.has(key)) {
      const watchedAt = new Date(item.watchedAt);
      if (Number.isNaN(watchedAt.getTime())) failed++;
      else watchedData.push({ userId, tmdbId, mediaType: item.mediaType, watchedAt });
    }

    if (item.inWatchlist && !hasWatchlist.has(key)) {
      watchlistData.push({ userId, tmdbId, mediaType: item.mediaType });
    }

    // Rating — only accept whole numbers 1-10
    if (item.rating != null && !hasRating.has(key)) {
      if (!Number.isInteger(item.rating) || item.rating < 1 || item.rating > 10) failed++;
      else ratingData.push({ userId, tmdbId, mediaType: item.mediaType, score: item.rating });
    }

    if (typeof item.review === 'string' && item.review.trim().length >= 10 && !hasReview.has(key)) {
      reviewData.push({ userId, tmdbId, mediaType: item.mediaType, body: sanitizeText(item.review).slice(0, 5000), containsSpoiler: false });
    }
  }

  // Diary events — one per watch ROW in the file, so a Letterboxd export with
  // several dates for the same film imports as first-watch + rewatches. Within
  // each title, the earliest date is the original watch.
  const eventData: { userId: string; tmdbId: string; mediaType: 'MOVIE' | 'SHOW'; watchedAt: Date; isRewatch: boolean }[] = [];
  // One summary row per title, stamped with its EARLIEST watch date — Watch
  // history keeps first-watch order; rewatch recency lives in the Rewatched
  // shelf (matches POST /api/diary).
  const watchedRows: typeof watchedData = [];
  {
    const byTitle = new Map<string, { tmdbId: string; mediaType: 'MOVIE' | 'SHOW'; watchedAt: Date }[]>();
    for (const w of watchedData) {
      const k = `${w.tmdbId}:${w.mediaType}`;
      const arr = byTitle.get(k) ?? [];
      arr.push(w);
      byTitle.set(k, arr);
    }
    for (const rows of byTitle.values()) {
      rows.sort((a, b) => a.watchedAt.getTime() - b.watchedAt.getTime());
      rows.forEach((w, i) => {
        eventData.push({ userId, tmdbId: w.tmdbId, mediaType: w.mediaType, watchedAt: w.watchedAt, isRewatch: i > 0 });
      });
      const first = rows[0];
      watchedRows.push({ userId, tmdbId: first.tmdbId, mediaType: first.mediaType, watchedAt: first.watchedAt });
    }
  }

  // skipDuplicates guards against any (userId, tmdbId, mediaType) collision the
  // pre-filter missed (e.g. duplicate rows within the uploaded file itself).
  const [watchedRes, watchlistRes, ratingRes, reviewRes] = await Promise.all([
    watchedRows.length ? prisma.watchedItem.createMany({ data: watchedRows, skipDuplicates: true }) : Promise.resolve({ count: 0 }),
    watchlistData.length ? prisma.watchlistItem.createMany({ data: watchlistData, skipDuplicates: true }) : Promise.resolve({ count: 0 }),
    ratingData.length ? prisma.rating.createMany({ data: ratingData, skipDuplicates: true }) : Promise.resolve({ count: 0 }),
    reviewData.length ? prisma.review.createMany({ data: reviewData, skipDuplicates: true }) : Promise.resolve({ count: 0 }),
  ]);

  // Diary events after the watched rows land (no unique constraint to lean on,
  // and the pre-filter already excluded titles the user had before this import).
  if (eventData.length) await prisma.watchEvent.createMany({ data: eventData });

  const watchedAdded = watchedRes.count;
  const watchlistAdded = watchlistRes.count;
  const ratingsAdded = ratingRes.count;
  const reviewsAdded = reviewRes.count;
  // Extra viewings beyond each title's first watch — the rewatch history that
  // came in from diary.csv (so the summary can show it was imported).
  const rewatchesAdded = eventData.filter(e => e.isRewatch).length;

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

  return ok({ watchedAdded, ratingsAdded, watchlistAdded, reviewsAdded, rewatchesAdded, failed });
}
