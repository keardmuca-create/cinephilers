import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { writeLimit } from '@/lib/write-limit';
import { getCurrentUser } from '@/lib/auth-utils';
import { canonicalId, legacyTwin } from '@/lib/media-id';
import { MediaType } from '@/generated/prisma/client';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ tmdbId: string }> }) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);
  const limited = await writeLimit(req, auth.sub);
  if (limited) return limited;

  const { tmdbId } = await params;
  const mediaType = new URL(req.url).searchParams.get('mediaType') as MediaType | null;
  if (!mediaType || !['MOVIE', 'SHOW'].includes(mediaType)) return err('mediaType query param required (MOVIE or SHOW)');

  // Older imports stored movie ids bare-numeric ("496243") instead of the canonical
  // "tmdb-496243". Delete BOTH forms, or a legacy twin row survives the delete and the
  // next sync re-canonicalizes it straight back into the user's ratings — the rating
  // that "won't stay removed".
  const ids = [tmdbId];
  const twin = legacyTwin(tmdbId);
  if (twin) ids.push(twin);

  // Read the score before deleting so we know how much to subtract from the
  // Cinephilers aggregate.
  const existing = await prisma.rating.findFirst({
    where: { userId: auth.sub, tmdbId: { in: ids }, mediaType },
    select: { score: true },
  });

  const deleted = await prisma.rating.deleteMany({
    where: { userId: auth.sub, tmdbId: { in: ids }, mediaType },
  });

  if (deleted.count > 0) {
    await prisma.user.update({
      where: { id: auth.sub },
      data: { ratingsCount: { decrement: deleted.count } },
    });
    if (existing) {
      // updateMany (not update) so a missing aggregate row never throws.
      await prisma.movieRating.updateMany({
        where: { tmdbId: canonicalId(tmdbId), mediaType },
        data: { count: { decrement: 1 }, sum: { decrement: existing.score } },
      });
    }
  }

  return ok(null, 'Rating removed');
}
