import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';
import { MediaType } from '@/generated/prisma/client';
import { canonicalId, isRateableMediaId } from '@/lib/media-id';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  const { id: listId } = await params;
  const list = await prisma.customList.findUnique({ where: { id: listId }, select: { userId: true } });
  if (!list) return err('List not found', 404);
  if (list.userId !== auth.sub) return err('Forbidden', 403);

  const body = await req.json().catch(() => null);
  if (!body) return err('Invalid JSON');

  const { tmdbId: rawId, mediaType, note, title, poster, year } = body as { tmdbId: string; mediaType: string; note?: string; title?: string; poster?: string; year?: string };
  if (!rawId || !mediaType) return err('tmdbId and mediaType are required');
  if (!['MOVIE', 'SHOW'].includes(mediaType)) return err('mediaType must be MOVIE or SHOW');
  if (note && note.length > 500) return err('Note must be under 500 characters');
  const tmdbId = canonicalId(String(rawId));
  if (!isRateableMediaId(tmdbId)) return err('Invalid tmdbId');

  const existingItem = await prisma.customListItem.findUnique({
    where: { listId_tmdbId_mediaType: { listId, tmdbId, mediaType: mediaType as MediaType } },
    select: { listId: true },
  });

  const item = await prisma.customListItem.upsert({
    where: { listId_tmdbId_mediaType: { listId, tmdbId, mediaType: mediaType as MediaType } },
    create: { listId, tmdbId, mediaType: mediaType as MediaType, note: note?.trim() || null, title: title ?? null, poster: poster ?? null, year: year ?? null },
    update: { note: note?.trim() || null, ...(title && { title }), ...(poster && { poster }), ...(year && { year }) },
  });

  // Only increment count when adding a new item, not updating
  if (!existingItem) {
    await prisma.customList.update({ where: { id: listId }, data: { itemsCount: { increment: 1 } } });
  }

  return ok(item, 'Item added', { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  const { id: listId } = await params;
  const list = await prisma.customList.findUnique({ where: { id: listId }, select: { userId: true } });
  if (!list) return err('List not found', 404);
  if (list.userId !== auth.sub) return err('Forbidden', 403);

  const { searchParams } = new URL(req.url);
  const tmdbId = searchParams.get('tmdbId');
  const mediaType = searchParams.get('mediaType') as MediaType | null;
  if (!tmdbId || !mediaType) return err('tmdbId and mediaType query params required');

  const deleted = await prisma.customListItem.deleteMany({
    where: { listId, tmdbId, mediaType },
  });

  if (deleted.count > 0) {
    await prisma.customList.update({ where: { id: listId }, data: { itemsCount: { decrement: 1 } } });
  }

  return ok(null, 'Item removed');
}
