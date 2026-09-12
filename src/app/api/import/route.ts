import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { verifyAccessToken } from '@/lib/auth-utils';
import { sanitizeText } from '@/lib/sanitize';
import { rateLimit } from '@/lib/rate-limit';
import { canonicalId, isValidMediaId } from '@/lib/media-id';
import { recomputeMovieRatings } from '@/lib/movie-rating-sync';
import { getAiredEpisodes } from '@/lib/tmdb';
import * as Sentry from '@sentry/nextjs';

export const dynamic = 'force-dynamic';
// Rated shows load their episode lists from TMDB before anything is written, one
// request per season. A library with a lot of shows needs more than the default.
export const maxDuration = 300;

interface ImportItem {
  tmdbId: string;
  mediaType: 'MOVIE' | 'SHOW';
  rating?: number;       // 1-10
  review?: string;       // text
  reviewedAt?: string;   // ISO date the review was written
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
  const ratingData: { userId: string; tmdbId: string; mediaType: 'MOVIE' | 'SHOW'; score: number; createdAt?: Date }[] = [];
  const reviewData: { userId: string; tmdbId: string; mediaType: 'MOVIE' | 'SHOW'; body: string; containsSpoiler: boolean; createdAt?: Date }[] = [];
  // Rated shows to mark watched, with the date to stamp their episodes.
  const showsToMark = new Map<string, Date>();

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

    // A rated show is a watched show — on IMDb, rating it is how you say you saw
    // it — so every aired episode gets ticked, the same as the show page's "Mark
    // all". Never as a show-level WatchedItem: a show's episodes ARE its watched
    // record. Imported that way it was a lone card in Watch history, the show page
    // still said "Mark as Watched", and Stats credited every episode with none
    // ticked (seeded test with real TMDB data, 2026-09-12). The episode lists are
    // fetched below, before anything is written.
    if (item.watchedAt && item.mediaType === 'SHOW' && tmdbId.startsWith('tmdb-tv-')) {
      const ratedAt = new Date(item.watchedAt);
      if (!Number.isNaN(ratedAt.getTime())) {
        const stamp = ratedAt.getTime() > Date.now() ? new Date() : ratedAt;
        const prev = showsToMark.get(tmdbId);
        if (!prev || stamp < prev) showsToMark.set(tmdbId, stamp);
      }
    }

    if (item.watchedAt && item.mediaType === 'MOVIE' && !hasWatched.has(key)) {
      const watchedAt = new Date(item.watchedAt);
      if (Number.isNaN(watchedAt.getTime())) failed++;
      else watchedData.push({ userId, tmdbId, mediaType: item.mediaType, watchedAt });
    }

    if (item.inWatchlist && !hasWatchlist.has(key)) {
      watchlistData.push({ userId, tmdbId, mediaType: item.mediaType });
    }

    // Rating — only accept whole numbers 1-10. Backdate createdAt to the
    // file's rated/watched date: the login sync rebuilds every device's
    // "Date rated" order from Rating.createdAt, so without this an import's
    // real dates survive only on the browser that ran the import.
    if (item.rating != null && !hasRating.has(key)) {
      if (!Number.isInteger(item.rating) || item.rating < 1 || item.rating > 10) failed++;
      else {
        const ratedAt = item.watchedAt ? new Date(item.watchedAt) : null;
        const validRatedAt = ratedAt && !Number.isNaN(ratedAt.getTime()) && ratedAt.getTime() <= Date.now() && ratedAt.getFullYear() >= 1900;
        ratingData.push({
          userId, tmdbId, mediaType: item.mediaType, score: item.rating,
          ...(validRatedAt ? { createdAt: ratedAt } : {}),
        });
      }
    }

    if (typeof item.review === 'string' && item.review.trim().length >= 10 && !hasReview.has(key)) {
      // Backdate to the review's written date (Letterboxd 'Date'), falling back
      // to the watched date — so an imported review reads as old, keeps its real
      // order, and doesn't flood followers' feeds as if written just now.
      const rawDate = item.reviewedAt ?? item.watchedAt;
      const writtenAt = rawDate ? new Date(rawDate) : null;
      const validWrittenAt = writtenAt && !Number.isNaN(writtenAt.getTime()) && writtenAt.getTime() <= Date.now() && writtenAt.getFullYear() >= 1900;
      reviewData.push({
        userId, tmdbId, mediaType: item.mediaType,
        body: sanitizeText(item.review).slice(0, 5000), containsSpoiler: false,
        ...(validWrittenAt ? { createdAt: writtenAt } : {}),
      });
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

  // Every aired episode of each rated show, stamped with the IMDb rating date.
  // Fetched before any write so a slow TMDB can't leave half an import behind.
  // A show whose list won't load keeps its rating and is reported back, so the
  // person knows to mark it from the show page — nothing is guessed.
  const episodeData: { userId: string; showTmdbId: string; season: number; episode: number; watchedAt: Date }[] = [];
  // What the importing device needs to mirror the episodes locally.
  const showEpisodes: Record<string, { keys: string[]; total: number; watchedAt: string }> = {};
  let showsFailed = 0;
  {
    const shows = [...showsToMark.entries()];
    // Each show fans out one request per season, so keep the shows themselves few
    // at a time to stay well inside TMDB's rate limit.
    const SHOW_CONCURRENCY = 3;
    for (let i = 0; i < shows.length; i += SHOW_CONCURRENCY) {
      const batch = shows.slice(i, i + SHOW_CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map(([id]) => getAiredEpisodes(parseInt(id.slice('tmdb-tv-'.length), 10))),
      );
      results.forEach((r, idx) => {
        const [showTmdbId, watchedAt] = batch[idx];
        if (r.status !== 'fulfilled') { showsFailed++; return; }
        // Same ceiling as the bulk episode route.
        const eps = r.value.episodes.slice(0, 2000);
        if (eps.length === 0) return;
        for (const e of eps) episodeData.push({ userId, showTmdbId, season: e.season, episode: e.episode, watchedAt });
        showEpisodes[showTmdbId] = { keys: eps.map(e => `S${e.season}E${e.episode}`), total: r.value.total, watchedAt: watchedAt.toISOString() };
      });
    }
    if (showsFailed > 0) {
      Sentry.captureMessage(`Import could not load episodes for ${showsFailed} show(s) for user ${userId}`, 'warning');
    }
  }
  // Episodes already ticked stay as they were, and a show counts as newly marked
  // only when this import ticked something in it — re-importing the same file
  // should report nothing, not "3 shows marked".
  let showsMarked = 0;
  if (episodeData.length) {
    const existing = await prisma.watchedEpisode.findMany({
      where: { userId, showTmdbId: { in: Object.keys(showEpisodes) } },
      select: { showTmdbId: true, season: true, episode: true },
    });
    const had = new Set(existing.map(e => `${e.showTmdbId}:${e.season}:${e.episode}`));
    const fresh = episodeData.filter(e => !had.has(`${e.showTmdbId}:${e.season}:${e.episode}`));
    showsMarked = new Set(fresh.map(e => e.showTmdbId)).size;
    episodeData.length = 0;
    episodeData.push(...fresh);
  }

  // Marks the boundary between rows that existed before this request and rows it
  // wrote, which is what scopes the updatedAt repair further down.
  const importStartedAt = new Date();

  // skipDuplicates guards against any (userId, tmdbId, mediaType) collision the
  // pre-filter missed (e.g. duplicate rows within the uploaded file itself).
  // skipDuplicates on the episodes too, so episodes already ticked stay as they
  // were. Chunked: a few long shows run to thousands of rows, and one statement
  // has a 65,535-parameter ceiling.
  const insertEpisodes = async () => {
    let count = 0;
    for (let i = 0; i < episodeData.length; i += 5000) {
      count += (await prisma.watchedEpisode.createMany({ data: episodeData.slice(i, i + 5000), skipDuplicates: true })).count;
    }
    return count;
  };
  const [watchedRes, watchlistRes, ratingRes, reviewRes, episodesAdded] = await Promise.all([
    watchedRows.length ? prisma.watchedItem.createMany({ data: watchedRows, skipDuplicates: true }) : Promise.resolve({ count: 0 }),
    watchlistData.length ? prisma.watchlistItem.createMany({ data: watchlistData, skipDuplicates: true }) : Promise.resolve({ count: 0 }),
    ratingData.length ? prisma.rating.createMany({ data: ratingData, skipDuplicates: true }) : Promise.resolve({ count: 0 }),
    reviewData.length ? prisma.review.createMany({ data: reviewData, skipDuplicates: true }) : Promise.resolve({ count: 0 }),
    insertEpisodes(),
  ]);

  // Diary events after the watched rows land (no unique constraint to lean on,
  // and the pre-filter already excluded titles the user had before this import).
  if (eventData.length) await prisma.watchEvent.createMany({ data: eventData });


  // Prisma stamps @updatedAt with the moment a row is written and ignores any value
  // passed on create, so every imported rating lands with updatedAt = now even though
  // createdAt was correctly backdated to the real watch date.
  //
  // That field is not cosmetic: /api/feed orders the social feed by it, and the
  // profile's Recent Activity reads it in preference to createdAt. Without this, an
  // import reads as "watched all of these just now" and floods followers' feeds with
  // the whole library — exactly what backdating the reviews above was written to
  // prevent, missed for ratings because they carry a second timestamp.
  //
  // Scoped to rows this request wrote (updatedAt at or after the start) that were
  // backdated (createdAt before it), so a rating genuinely re-scored later is never
  // touched. Like the recompute below, it must not fail an import that has already
  // committed — a wrong sort order is worth less than a library.
  if (ratingRes.count > 0) {
    try {
      await prisma.$executeRaw`
        UPDATE "Rating" SET "updatedAt" = "createdAt"
        WHERE "userId" = ${userId}
          AND "updatedAt" >= ${importStartedAt}
          AND "createdAt" < ${importStartedAt}
      `;
    } catch (e) {
      Sentry.captureException(e);
    }
  }

  // Imported votes must count toward the Cinephilers score. Recompute the
  // aggregates for every title this import rated — recompute (not increment)
  // so it stays correct regardless of what skipDuplicates actually skipped.
  //
  // Deliberately not allowed to fail the request. Every row above is already
  // committed by this point, so throwing here tells someone their import failed
  // when it did not — and they retry, against a 3-per-10-minutes limit. The
  // aggregate is a derived number that self-heals on the next vote for that
  // title; the user's library is not. Report it and move on.
  try {
    const { failed: aggregateFailed } = await recomputeMovieRatings(
      ratingData.map(r => ({ tmdbId: r.tmdbId, mediaType: r.mediaType })),
    );
    if (aggregateFailed > 0) {
      Sentry.captureMessage(
        `Import left ${aggregateFailed} MovieRating aggregates stale for user ${userId}`,
        'warning',
      );
    }
  } catch (e) {
    Sentry.captureException(e);
  }

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

  return ok({ watchedAdded, ratingsAdded, watchlistAdded, reviewsAdded, rewatchesAdded, showsMarked, episodesAdded, showsFailed, showEpisodes, failed });
}
