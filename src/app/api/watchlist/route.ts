import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { writeLimit } from '@/lib/write-limit';
import { getCurrentUser } from '@/lib/auth-utils';
import { MediaType } from '@/generated/prisma/client';
import { canonicalId, isRateableMediaId } from '@/lib/media-id';

export async function POST(req: NextRequest) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);
  const limited = await writeLimit(req, auth.sub);
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  if (!body) return err('Invalid JSON');

  const { tmdbId: rawId, mediaType } = body as { tmdbId: string; mediaType: string };
  if (!rawId || !mediaType) return err('tmdbId and mediaType are required');
  if (!['MOVIE', 'SHOW'].includes(mediaType)) return err('mediaType must be MOVIE or SHOW');
  const tmdbId = canonicalId(String(rawId));
  if (!isRateableMediaId(tmdbId)) return err('Invalid tmdbId');

  const item = await prisma.watchlistItem.upsert({
    where: { userId_tmdbId_mediaType: { userId: auth.sub, tmdbId, mediaType: mediaType as MediaType } },
    create: { userId: auth.sub, tmdbId, mediaType: mediaType as MediaType },
    update: {},
  });

  return ok(item, 'Added to watchlist', { status: 201 });
}
