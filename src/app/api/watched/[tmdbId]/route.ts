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
  if (!mediaType || !['MOVIE', 'SHOW'].includes(mediaType)) return err('mediaType query param required');

  await prisma.watchedItem.deleteMany({ where: { userId: auth.sub, tmdbId, mediaType } });
  return ok(null, 'Removed from watched');
}
