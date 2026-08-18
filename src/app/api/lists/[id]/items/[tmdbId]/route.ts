import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';
import { MediaType } from '@/generated/prisma/client';
import { canonicalId, legacyTwin } from '@/lib/media-id';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; tmdbId: string }> }
) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  const { id: listId, tmdbId: rawId } = await params;
  const mediaType = new URL(req.url).searchParams.get('mediaType') as MediaType | null;
  if (!mediaType || !['MOVIE', 'SHOW'].includes(mediaType)) return err('mediaType query param required');

  const list = await prisma.customList.findUnique({ where: { id: listId }, select: { userId: true } });
  if (!list) return err('List not found', 404);
  if (list.userId !== auth.sub) return err('Forbidden', 403);

  // Both id forms — see the favorites route for why.
  const tmdbId = canonicalId(rawId);
  const ids = [tmdbId];
  const twin = legacyTwin(tmdbId);
  if (twin) ids.push(twin);

  const deleted = await prisma.customListItem.deleteMany({
    where: { listId, tmdbId: { in: ids }, mediaType },
  });

  // Decrement by what actually went, not by one. Both id forms are matched
  // above, so a title stored under the canonical id AND its legacy twin removes
  // two rows — and subtracting one left the list claiming a title it no longer
  // held.
  if (deleted.count > 0) {
    await prisma.customList.update({ where: { id: listId }, data: { itemsCount: { decrement: deleted.count } } });
  }

  return ok(null, 'Item removed');
}
