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
  if (typeof showTmdbId !== 'string' || showTmdbId.length > 64) return err('Invalid showTmdbId');
  // Non-integers throw a Prisma 500; absurd values would just store junk rows.
  if (!Number.isInteger(season) || season < 0 || season > 200) return err('Invalid season');
  if (!Number.isInteger(episode) || episode < 0 || episode > 2000) return err('Invalid episode');

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
