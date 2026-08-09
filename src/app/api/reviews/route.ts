import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';
import { MediaType } from '@/generated/prisma/client';
import { sanitizeText } from '@/lib/sanitize';
import { rateLimit } from '@/lib/rate-limit';
import { canonicalId, isRateableMediaId, legacyTwin } from '@/lib/media-id';

export async function POST(req: NextRequest) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  const { allowed, retryAfter } = await rateLimit(`review:${auth.sub}`, 10, 60_000);
  if (!allowed) return err(`Too many reviews. Try again in ${retryAfter}s`, 429);

  const body = await req.json().catch(() => null);
  if (!body) return err('Invalid JSON');

  const { tmdbId: rawId, mediaType, body: reviewBody, containsSpoiler } = body as {
    tmdbId: string; mediaType: string; body: string; containsSpoiler?: boolean;
  };
  if (!rawId || !mediaType || !reviewBody) return err('tmdbId, mediaType, and body are required');
  if (!['MOVIE', 'SHOW'].includes(mediaType)) return err('mediaType must be MOVIE or SHOW');
  // Fold a bare numeric id into `tmdb-{n}` before it reaches the database. A row
  // written under the other form is invisible to every page that looks the title
  // up by its canonical id, which is how 14 watchlist rows went missing.
  const tmdbId = canonicalId(String(rawId));
  if (!isRateableMediaId(tmdbId)) return err('Invalid tmdbId');
  const cleanBody = sanitizeText(reviewBody);
  if (cleanBody.length < 10) return err('Review must be at least 10 characters');
  if (cleanBody.length > 5000) return err('Review must be under 5000 characters');

  const existing = await prisma.review.findUnique({
    where: { userId_tmdbId_mediaType: { userId: auth.sub, tmdbId, mediaType: mediaType as MediaType } },
    select: { id: true },
  });

  const review = await prisma.review.upsert({
    where: { userId_tmdbId_mediaType: { userId: auth.sub, tmdbId, mediaType: mediaType as MediaType } },
    create: {
      userId: auth.sub, tmdbId, mediaType: mediaType as MediaType,
      body: cleanBody, containsSpoiler: containsSpoiler ?? false,
    },
    update: { body: cleanBody, containsSpoiler: containsSpoiler ?? false },
  });

  // Only increment count when creating a new review, not updating
  if (!existing) {
    await prisma.user.update({
      where: { id: auth.sub },
      data: { reviewsCount: { increment: 1 } },
    });
  }

  return ok(review, 'Review saved', { status: 201 });
}

// Delete a review by tmdbId + mediaType. The profile list only knows the tmdbId
// (not the DB review id), so it deletes here rather than via /api/reviews/[id].
export async function DELETE(req: NextRequest) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  const url = new URL(req.url);
  const rawId = url.searchParams.get('tmdbId');
  const mediaType = url.searchParams.get('mediaType');
  if (!rawId || !mediaType) return err('tmdbId and mediaType are required');
  if (!['MOVIE', 'SHOW'].includes(mediaType)) return err('mediaType must be MOVIE or SHOW');

  // Both forms, so a delete can still reach a row written before ids were folded.
  const tmdbId = canonicalId(rawId);
  const ids = [tmdbId];
  const twin = legacyTwin(tmdbId);
  if (twin) ids.push(twin);

  const { count } = await prisma.review.deleteMany({
    where: { userId: auth.sub, tmdbId: { in: ids }, mediaType: mediaType as MediaType },
  });
  if (count > 0) {
    await prisma.user.update({
      where: { id: auth.sub },
      data: { reviewsCount: { decrement: count } },
    });
  }

  return ok(null, 'Review deleted');
}
