import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';
import { legacyTwin } from '@/lib/media-id';
import { MediaType } from '@/generated/prisma/client';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ tmdbId: string }> }) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  const { tmdbId } = await params;
  const mediaType = new URL(req.url).searchParams.get('mediaType') as MediaType | null;
  if (!mediaType || !['MOVIE', 'SHOW'].includes(mediaType)) return err('mediaType query param required');

  // Delete both the canonical id and any legacy bare-numeric twin ("496243" vs
  // "tmdb-496243"), so an old-import row can't survive and re-sync back.
  const ids = [tmdbId];
  const twin = legacyTwin(tmdbId);
  if (twin) ids.push(twin);

  await prisma.watchlistItem.deleteMany({ where: { userId: auth.sub, tmdbId: { in: ids }, mediaType } });
  return ok(null, 'Removed from watchlist');
}
