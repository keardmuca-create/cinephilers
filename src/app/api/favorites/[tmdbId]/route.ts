import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';
import { MediaType } from '@/generated/prisma/client';
import { canonicalId, legacyTwin } from '@/lib/media-id';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ tmdbId: string }> }) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  const { tmdbId: rawId } = await params;
  const mediaType = new URL(req.url).searchParams.get('mediaType') as MediaType | null;
  if (!mediaType || !['MOVIE', 'SHOW'].includes(mediaType)) return err('mediaType query param required');

  // Both id forms: a delete that matches only the canonical one leaves an older
  // row in place, and it comes back on the next sync as if nothing happened.
  const tmdbId = canonicalId(rawId);
  const ids = [tmdbId];
  const twin = legacyTwin(tmdbId);
  if (twin) ids.push(twin);

  await prisma.favorite.deleteMany({ where: { userId: auth.sub, tmdbId: { in: ids }, mediaType } });
  return ok(null, 'Removed from favorites');
}
