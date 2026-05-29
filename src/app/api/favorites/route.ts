import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';
import { MediaType } from '@/generated/prisma/client';

export async function POST(req: NextRequest) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  const body = await req.json().catch(() => null);
  if (!body) return err('Invalid JSON');

  const { tmdbId, mediaType } = body as { tmdbId: string; mediaType: string };
  if (!tmdbId || !mediaType) return err('tmdbId and mediaType are required');
  if (!['MOVIE', 'SHOW'].includes(mediaType)) return err('mediaType must be MOVIE or SHOW');

  const count = await prisma.favorite.count({ where: { userId: auth.sub } });
  if (count >= 4) return err('Maximum 4 favorites allowed');

  const item = await prisma.favorite.upsert({
    where: { userId_tmdbId_mediaType: { userId: auth.sub, tmdbId, mediaType: mediaType as MediaType } },
    create: { userId: auth.sub, tmdbId, mediaType: mediaType as MediaType },
    update: {},
  });

  return ok(item, 'Added to favorites', { status: 201 });
}
