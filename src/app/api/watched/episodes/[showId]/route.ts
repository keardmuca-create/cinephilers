import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';

export async function GET(req: NextRequest, { params }: { params: Promise<{ showId: string }> }) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  const { showId } = await params;
  const episodes = await prisma.watchedEpisode.findMany({
    where: { userId: auth.sub, showTmdbId: showId },
    select: { season: true, episode: true },
  });

  // Return keys in "S{n}E{n}" format matching the UI convention
  const keys = episodes.map(e => `S${e.season}E${e.episode}`);
  return ok(keys);
}
