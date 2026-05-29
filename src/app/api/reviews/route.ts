import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';
import { MediaType } from '@prisma/client';

export async function POST(req: NextRequest) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  const body = await req.json().catch(() => null);
  if (!body) return err('Invalid JSON');

  const { tmdbId, mediaType, body: reviewBody, containsSpoiler } = body as {
    tmdbId: string; mediaType: string; body: string; containsSpoiler?: boolean;
  };
  if (!tmdbId || !mediaType || !reviewBody) return err('tmdbId, mediaType, and body are required');
  if (!['MOVIE', 'SHOW'].includes(mediaType)) return err('mediaType must be MOVIE or SHOW');
  if (reviewBody.trim().length < 10) return err('Review must be at least 10 characters');

  const review = await prisma.review.upsert({
    where: { userId_tmdbId_mediaType: { userId: auth.sub, tmdbId, mediaType: mediaType as MediaType } },
    create: {
      userId: auth.sub, tmdbId, mediaType: mediaType as MediaType,
      body: reviewBody.trim(), containsSpoiler: containsSpoiler ?? false,
    },
    update: { body: reviewBody.trim(), containsSpoiler: containsSpoiler ?? false },
  });

  await prisma.user.update({
    where: { id: auth.sub },
    data: { reviewsCount: { increment: 1 } },
  });

  return ok(review, 'Review saved', { status: 201 });
}
