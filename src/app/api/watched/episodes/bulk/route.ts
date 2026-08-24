import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { writeLimit } from '@/lib/write-limit';
import { getCurrentUser } from '@/lib/auth-utils';

// Mark or unmark every episode of a show in one request.
//
// The per-episode route is fine for ticking one box, but marking a whole show
// means one write per episode — 220 requests for Naruto. This takes the full
// list and does it in a single round trip.
const MAX_EPISODES = 2000;

export async function POST(req: NextRequest) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);
  const limited = await writeLimit(req, auth.sub);
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  if (!body) return err('Invalid JSON');

  const { showTmdbId, episodes, watched } = body as {
    showTmdbId: string;
    episodes: { season: number; episode: number }[];
    watched: boolean;
  };

  if (!showTmdbId || typeof showTmdbId !== 'string' || showTmdbId.length > 64) return err('Invalid showTmdbId');
  if (!Array.isArray(episodes)) return err('episodes must be an array');
  if (episodes.length === 0) return err('episodes must not be empty');
  if (episodes.length > MAX_EPISODES) return err(`Too many episodes (max ${MAX_EPISODES})`);

  // Same bounds as the single-episode route: non-integers throw a Prisma 500 and
  // absurd values would just store junk rows.
  for (const e of episodes) {
    if (!e || !Number.isInteger(e.season) || e.season < 0 || e.season > 200) return err('Invalid season');
    if (!Number.isInteger(e.episode) || e.episode < 0 || e.episode > 2000) return err('Invalid episode');
  }

  if (watched) {
    // skipDuplicates so re-marking a partly-watched show doesn't fail on the
    // episodes already ticked.
    await prisma.watchedEpisode.createMany({
      data: episodes.map(e => ({ userId: auth.sub, showTmdbId, season: e.season, episode: e.episode })),
      skipDuplicates: true,
    });
  } else {
    await prisma.watchedEpisode.deleteMany({
      where: {
        userId: auth.sub,
        showTmdbId,
        OR: episodes.map(e => ({ season: e.season, episode: e.episode })),
      },
    });
  }

  return ok({ count: episodes.length }, watched ? 'Episodes marked watched' : 'Episodes unmarked');
}
