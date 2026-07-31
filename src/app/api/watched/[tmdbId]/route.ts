import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';
import { MediaType } from '@/generated/prisma/client';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ tmdbId: string }> }) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  const { tmdbId: rawId } = await params;
  const mediaType = new URL(req.url).searchParams.get('mediaType') as MediaType | null;
  if (!mediaType || !['MOVIE', 'SHOW'].includes(mediaType)) return err('mediaType query param required');
  const tmdbId = rawId.startsWith('tmdb-') ? rawId : `tmdb-${rawId}`;

  // Removing from history removes the whole title: summary row AND its diary
  // entries — otherwise the diary would resurrect it as "watched" on next log.
  //
  // For a show that now means its episodes too. A show's watched state is the sum
  // of its episodes, so leaving them behind doesn't just orphan rows — Watch
  // History builds show rows FROM episodes, so the show you just deleted would
  // reappear. The two in-app paths unmark episodes before calling this, but that
  // left the endpoint itself unsafe for any caller that forgot, and for the case
  // where the episode list can't be loaded to unmark from.
  await Promise.all([
    prisma.watchedItem.deleteMany({ where: { userId: auth.sub, tmdbId, mediaType } }),
    prisma.watchEvent.deleteMany({ where: { userId: auth.sub, tmdbId, mediaType } }),
    ...(mediaType === 'SHOW'
      ? [prisma.watchedEpisode.deleteMany({ where: { userId: auth.sub, showTmdbId: tmdbId } })]
      : []),
  ]);
  return ok(null, 'Removed from watched');
}
