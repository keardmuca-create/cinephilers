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

  const { tmdbId: rawId, mediaType, score } = body as { tmdbId: string; mediaType: string; score: number };
  if (!rawId || !mediaType || score === undefined) return err('tmdbId, mediaType, and score are required');
  if (!['MOVIE', 'SHOW'].includes(mediaType)) return err('mediaType must be MOVIE or SHOW');
  if (score < 1 || score > 10 || !Number.isInteger(score)) return err('Score must be an integer 1–10');
  // Canonicalize like the watched route does — a bare-numeric id stored here
  // becomes a "legacy twin" that resurrects on sync and splits the aggregate.
  // Episodes are rateable too (mediaType SHOW, id `tmdb-tv-{n}-S{s}E{e}`); the
  // stricter isValidMediaId still guards watchlist/favourites/daily-pick.
  const tmdbId = canonicalId(String(rawId));
  if (!isRateableMediaId(tmdbId)) return err('Invalid tmdbId');

  const existing = await prisma.rating.findUnique({
    where: { userId_tmdbId_mediaType: { userId: auth.sub, tmdbId, mediaType: mediaType as MediaType } },
  });

  const rating = await prisma.rating.upsert({
    where: { userId_tmdbId_mediaType: { userId: auth.sub, tmdbId, mediaType: mediaType as MediaType } },
    create: { userId: auth.sub, tmdbId, mediaType: mediaType as MediaType, score },
    update: { score },
  });

  // Keep the Cinephilers aggregate (count + sum) in sync. New rating adds one
  // vote; a score change shifts the sum by the delta. Atomic increments so
  // concurrent raters never clobber each other.
  if (!existing) {
    await prisma.movieRating.upsert({
      where: { tmdbId_mediaType: { tmdbId, mediaType: mediaType as MediaType } },
      create: { tmdbId, mediaType: mediaType as MediaType, count: 1, sum: score },
      update: { count: { increment: 1 }, sum: { increment: score } },
    });
  } else if (existing.score !== score) {
    await prisma.movieRating.upsert({
      where: { tmdbId_mediaType: { tmdbId, mediaType: mediaType as MediaType } },
      create: { tmdbId, mediaType: mediaType as MediaType, count: 1, sum: score },
      update: { sum: { increment: score - existing.score } },
    });
  }

  if (!existing) {
    await prisma.user.update({
      where: { id: auth.sub },
      data: { ratingsCount: { increment: 1 } },
    });
  }

  // Rating an episode marks THAT EPISODE watched, in the episodes table where a
  // watched episode belongs. Sending it down the path below instead wrote a
  // WatchedItem row keyed by the episode's id — a phantom the sync then deletes
  // on sight, so the auto-mark silently achieved nothing and the episode stayed
  // unwatched. Nobody had rated an episode yet, which is the only reason this
  // hadn't bitten.
  const epMatch = /^(tmdb-tv-\d+)-S(\d+)E(\d+)$/.exec(tmdbId);
  if (epMatch) {
    const [, showTmdbId, season, episode] = epMatch;
    await prisma.watchedEpisode.upsert({
      where: {
        userId_showTmdbId_season_episode: {
          userId: auth.sub, showTmdbId, season: parseInt(season, 10), episode: parseInt(episode, 10),
        },
      },
      create: { userId: auth.sub, showTmdbId, season: parseInt(season, 10), episode: parseInt(episode, 10) },
      update: {},
    });
    return ok(rating, existing ? 'Rating updated' : 'Rating saved', { status: existing ? 200 : 201 });
  }

  // Rating a SERIES marks nothing watched. A show's watched state is the sum of
  // its episodes, and a rating says which episodes you saw about as well as it
  // says when — so writing a show-level watched row here would be inventing the
  // second record the model exists to avoid, and marking 62 episodes off one
  // rating would be worse.
  if (mediaType === 'SHOW') {
    return ok(rating, existing ? 'Rating updated' : 'Rating saved', { status: existing ? 200 : 201 });
  }

  // Auto-mark as watched when rated. upsert isn't atomic, so two ratings for the
  // same film landing together (rapid taps, or a flaky-network retry) can both
  // try to INSERT — the loser hits the unique constraint. That just means it's
  // already watched, so treat the P2002 conflict as success instead of 500ing.
  try {
    await prisma.watchedItem.upsert({
      where: { userId_tmdbId_mediaType: { userId: auth.sub, tmdbId, mediaType: mediaType as MediaType } },
      create: { userId: auth.sub, tmdbId, mediaType: mediaType as MediaType },
      update: {},
    });
    // Seed the diary too when this rating created the first watch.
    const hasEvent = await prisma.watchEvent.count({
      where: { userId: auth.sub, tmdbId, mediaType: mediaType as MediaType },
    });
    if (hasEvent === 0) {
      await prisma.watchEvent.create({
        data: { userId: auth.sub, tmdbId, mediaType: mediaType as MediaType },
      });
    }
  } catch (e) {
    if (!(e && typeof e === 'object' && (e as { code?: string }).code === 'P2002')) throw e;
  }

  return ok(rating, existing ? 'Rating updated' : 'Rating saved', { status: existing ? 200 : 201 });
}
