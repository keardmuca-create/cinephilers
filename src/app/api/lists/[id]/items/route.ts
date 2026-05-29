import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';
import { MediaType } from '@/generated/prisma/client';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  const { id: listId } = await params;
  const list = await prisma.customList.findUnique({ where: { id: listId }, select: { userId: true } });
  if (!list) return err('List not found', 404);
  if (list.userId !== auth.sub) return err('Forbidden', 403);

  const body = await req.json().catch(() => null);
  if (!body) return err('Invalid JSON');

  const { tmdbId, mediaType, note } = body as { tmdbId: string; mediaType: string; note?: string };
  if (!tmdbId || !mediaType) return err('tmdbId and mediaType are required');
  if (!['MOVIE', 'SHOW'].includes(mediaType)) return err('mediaType must be MOVIE or SHOW');

  const item = await prisma.customListItem.upsert({
    where: { listId_tmdbId_mediaType: { listId, tmdbId, mediaType: mediaType as MediaType } },
    create: { listId, tmdbId, mediaType: mediaType as MediaType, note: note?.trim() || null },
    update: { note: note?.trim() || null },
  });

  await prisma.customList.update({ where: { id: listId }, data: { itemsCount: { increment: 1 } } });

  return ok(item, 'Item added', { status: 201 });
}
