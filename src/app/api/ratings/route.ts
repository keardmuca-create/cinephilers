import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';
import { awardBadgeIfEarned } from '@/lib/badge-service';
import { MediaType } from '@prisma/client';

export async function POST(req: NextRequest) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  const body = await req.json().catch(() => null);
  if (!body) return err('Invalid JSON');

  const { tmdbId, mediaType, score } = body as { tmdbId: string; mediaType: string; score: number };
  if (!tmdbId || !mediaType || score === undefined) return err('tmdbId, mediaType, and score are required');
  if (!['MOVIE', 'SHOW'].includes(mediaType)) return err('mediaType must be MOVIE or SHOW');
  if (score < 1 || score > 10 || !Number.isInteger(score)) return err('Score must be an integer 1–10');

  const existing = await prisma.rating.findUnique({
    where: { userId_tmdbId_mediaType: { userId: auth.sub, tmdbId, mediaType: mediaType as MediaType } },
  });

  const rating = await prisma.rating.upsert({
    where: { userId_tmdbId_mediaType: { userId: auth.sub, tmdbId, mediaType: mediaType as MediaType } },
    create: { userId: auth.sub, tmdbId, mediaType: mediaType as MediaType, score },
    update: { score },
  });

  if (!existing) {
    const user = await prisma.user.update({
      where: { id: auth.sub },
      data: { ratingsCount: { increment: 1 } },
      select: { ratingsCount: true },
    });
    await awardBadgeIfEarned(auth.sub, user.ratingsCount);
  }

  return ok(rating, existing ? 'Rating updated' : 'Rating saved', { status: existing ? 200 : 201 });
}
