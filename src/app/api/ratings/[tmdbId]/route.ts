import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';
import { MediaType } from '@/generated/prisma/client';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ tmdbId: string }> }) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  const { tmdbId } = await params;
  const mediaType = new URL(req.url).searchParams.get('mediaType') as MediaType | null;
  if (!mediaType || !['MOVIE', 'SHOW'].includes(mediaType)) return err('mediaType query param required (MOVIE or SHOW)');

  // Read the score before deleting so we know how much to subtract from the
  // Cinephilers aggregate.
  const existing = await prisma.rating.findUnique({
    where: { userId_tmdbId_mediaType: { userId: auth.sub, tmdbId, mediaType } },
    select: { score: true },
  });

  const deleted = await prisma.rating.deleteMany({
    where: { userId: auth.sub, tmdbId, mediaType },
  });

  if (deleted.count > 0) {
    await prisma.user.update({
      where: { id: auth.sub },
      data: { ratingsCount: { decrement: 1 } },
    });
    if (existing) {
      // updateMany (not update) so a missing aggregate row never throws.
      await prisma.movieRating.updateMany({
        where: { tmdbId, mediaType },
        data: { count: { decrement: 1 }, sum: { decrement: existing.score } },
      });
    }
  }

  return ok(null, 'Rating removed');
}
