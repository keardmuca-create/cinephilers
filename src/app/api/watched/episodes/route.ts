import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';

export async function POST(req: NextRequest) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  const body = await req.json().catch(() => null);
  if (!body) return err('Invalid JSON');

  const { showTmdbId, season, episode, watched } = body as {
    showTmdbId: string;
    season: number;
    episode: number;
    watched: boolean;
  };
  if (!showTmdbId || season == null || episode == null) return err('showTmdbId, season, and episode are required');

  if (watched) {
    await prisma.watchedEpisode.upsert({
      where: { userId_showTmdbId_season_episode: { userId: auth.sub, showTmdbId, season, episode } },
      create: { userId: auth.sub, showTmdbId, season, episode },
      update: {},
    });
  } else {
    await prisma.watchedEpisode.deleteMany({
      where: { userId: auth.sub, showTmdbId, season, episode },
    });
  }

  return ok(null, watched ? 'Episode marked watched' : 'Episode unmarked');
}
