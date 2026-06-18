import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';
import { MediaType } from '@/generated/prisma/client';
import { sanitizeText } from '@/lib/sanitize';
import { rateLimit } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  const { allowed, retryAfter } = await rateLimit(`review:${auth.sub}`, 10, 60_000);
  if (!allowed) return err(`Too many reviews. Try again in ${retryAfter}s`, 429);

  const body = await req.json().catch(() => null);
  if (!body) return err('Invalid JSON');

  const { tmdbId, mediaType, body: reviewBody, containsSpoiler } = body as {
    tmdbId: string; mediaType: string; body: string; containsSpoiler?: boolean;
  };
  if (!tmdbId || !mediaType || !reviewBody) return err('tmdbId, mediaType, and body are required');
  if (!['MOVIE', 'SHOW'].includes(mediaType)) return err('mediaType must be MOVIE or SHOW');
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
  const tmdbId = url.searchParams.get('tmdbId');
  const mediaType = url.searchParams.get('mediaType');
  if (!tmdbId || !mediaType) return err('tmdbId and mediaType are required');
  if (!['MOVIE', 'SHOW'].includes(mediaType)) return err('mediaType must be MOVIE or SHOW');

  const { count } = await prisma.review.deleteMany({
    where: { userId: auth.sub, tmdbId, mediaType: mediaType as MediaType },
  });
  if (count > 0) {
    await prisma.user.update({
      where: { id: auth.sub },
      data: { reviewsCount: { decrement: count } },
    });
  }

  return ok(null, 'Review deleted');
}
