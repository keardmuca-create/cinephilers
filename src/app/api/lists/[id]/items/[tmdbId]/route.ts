import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';
import { MediaType } from '@/generated/prisma/client';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; tmdbId: string }> }
) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  const { id: listId, tmdbId } = await params;
  const mediaType = new URL(req.url).searchParams.get('mediaType') as MediaType | null;
  if (!mediaType || !['MOVIE', 'SHOW'].includes(mediaType)) return err('mediaType query param required');

  const list = await prisma.customList.findUnique({ where: { id: listId }, select: { userId: true } });
  if (!list) return err('List not found', 404);
  if (list.userId !== auth.sub) return err('Forbidden', 403);

  const deleted = await prisma.customListItem.deleteMany({
    where: { listId, tmdbId, mediaType },
  });

  if (deleted.count > 0) {
    await prisma.customList.update({ where: { id: listId }, data: { itemsCount: { decrement: 1 } } });
  }

  return ok(null, 'Item removed');
}
