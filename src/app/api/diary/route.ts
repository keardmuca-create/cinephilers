import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';
import { rateLimit } from '@/lib/rate-limit';
import { clampInt } from '@/lib/query-params';
import { canonicalId, isValidMediaId, isShowId, parseEpisodeId } from '@/lib/media-id';
import { MediaType } from '@/generated/prisma/client';

/** When a show's last watched episode was watched — a finished show's first
 *  viewing, since finishing one writes no diary entry. */
function lastEpisodeWatched(userId: string, showId: string) {
  return prisma.watchedEpisode.findFirst({
    // Both id shapes: the canonical one is what the app writes, but a bare number
    // costs nothing to also match.
    where: { userId, showTmdbId: { in: [showId, showId.replace('tmdb-tv-', '')] } },
    orderBy: { watchedAt: 'desc' },
    select: { watchedAt: true },
  });
}

// A whole show's log. Two differences from a film, both because a show has no
// watched record of its own — its episodes are the record:
//  - No WatchedItem is created. Those rows were removed on purpose
//    (scripts/drop-show-watched-records.ts), and writing one here brought the
//    second record back every time a show rewatch was logged.
//  - Finishing a show writes no diary entry, so the first log would read "Seen 1×"
//    for what is really a second viewing. That first log also files the original
//    watch, dated to the last episode watched (Keard's call, 2026-09-11) — the same
//    rule logEpisode applies to an episode.
// The strip that offers this appears only once every episode is watched.
async function logShow(userId: string, tmdbId: string, watchedAt: Date) {
  const where = { userId, tmdbId, mediaType: 'SHOW' as MediaType };
  const [priorCount, finished] = await Promise.all([
    prisma.watchEvent.count({ where }),
    lastEpisodeWatched(userId, tmdbId),
  ]);

  let seeded = 0;
  if (finished && priorCount === 0) {
    await prisma.watchEvent.create({ data: { ...where, isRewatch: false, watchedAt: finished.watchedAt } });
    seeded = 1;
  }
  const event = await prisma.watchEvent.create({
    data: { ...where, isRewatch: priorCount + seeded > 0, watchedAt },
  });

  const count = priorCount + seeded + 1;
  return ok({ event, count }, count > 1 ? 'Rewatch logged' : 'Watch logged', { status: 201 });
}

// One episode's log. Episodes were never given a first-watch entry — ticking one
// writes only its WatchedEpisode row — so the first log on an episode already
// ticked would read "Seen 1×" for what is really a second viewing. That first log
// therefore also files the original watch, dated to when the episode was marked
// watched (Keard's call, 2026-09-11). An episode logged without ever being ticked
// is marked watched by the log, the way a film's first log creates its summary.
async function logEpisode(
  userId: string,
  tmdbId: string,
  ep: { showId: string; season: number; episode: number },
  watchedAt: Date,
) {
  const where = { userId, tmdbId, mediaType: 'SHOW' as MediaType };
  const [priorCount, ticked] = await Promise.all([
    prisma.watchEvent.count({ where }),
    prisma.watchedEpisode.findUnique({
      where: { userId_showTmdbId_season_episode: { userId, showTmdbId: ep.showId, season: ep.season, episode: ep.episode } },
      select: { watchedAt: true },
    }),
  ]);

  let seeded = 0;
  if (ticked && priorCount === 0) {
    await prisma.watchEvent.create({ data: { ...where, isRewatch: false, watchedAt: ticked.watchedAt } });
    seeded = 1;
  }
  const event = await prisma.watchEvent.create({
    data: { ...where, isRewatch: priorCount + seeded > 0, watchedAt },
  });
  if (!ticked) {
    await prisma.watchedEpisode.create({
      data: { userId, showTmdbId: ep.showId, season: ep.season, episode: ep.episode, watchedAt },
    }).catch(e => {
      if ((e as { code?: string })?.code !== 'P2002') throw e;
    });
  }

  const count = priorCount + seeded + 1;
  return ok({ event, count }, count > 1 ? 'Rewatch logged' : 'Watch logged', { status: 201 });
}

// Log a watch (first watch or rewatch). Every call appends a diary entry —
// this is an EVENT, not a toggle. Also keeps the WatchedItem summary row in
// sync so every existing page (history, profile, feed) works unchanged.
export async function POST(req: NextRequest) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  const { allowed, retryAfter } = await rateLimit(`diary:${auth.sub}`, 30, 60_000);
  if (!allowed) return err(`Too many entries. Try again in ${retryAfter}s`, 429);

  const body = await req.json().catch(() => null);
  if (!body) return err('Invalid JSON');

  const { tmdbId: rawId, mediaType, watchedAt: rawDate } = body as {
    tmdbId: string; mediaType: string; watchedAt?: string;
  };
  if (!rawId || !mediaType) return err('tmdbId and mediaType are required');
  if (!['MOVIE', 'SHOW'].includes(mediaType)) return err('mediaType must be MOVIE or SHOW');
  const tmdbId = canonicalId(String(rawId));
  // A single episode can be logged too, filed under SHOW as its rating and review
  // are. Its summary is the episode's watched row, not a WatchedItem.
  const episode = mediaType === 'SHOW' ? parseEpisodeId(tmdbId) : null;
  if (!episode && !isValidMediaId(tmdbId)) return err('Invalid tmdbId');

  // Backdating is allowed (a diary is about when you actually watched), but
  // not the future and nothing before cinema existed.
  let watchedAt = new Date();
  if (rawDate !== undefined) {
    const d = new Date(rawDate);
    if (Number.isNaN(d.getTime())) return err('Invalid watchedAt date');
    if (d.getTime() > Date.now() + 24 * 60 * 60 * 1000) return err('watchedAt cannot be in the future');
    if (d.getFullYear() < 1900) return err('watchedAt is too far in the past');
    watchedAt = d;
  }

  if (episode) return logEpisode(auth.sub, tmdbId, episode, watchedAt);
  if (mediaType === 'SHOW' && isShowId(tmdbId)) return logShow(auth.sub, tmdbId, watchedAt);

  const priorCount = await prisma.watchEvent.count({
    where: { userId: auth.sub, tmdbId, mediaType: mediaType as MediaType },
  });

  const event = await prisma.watchEvent.create({
    data: {
      userId: auth.sub,
      tmdbId,
      mediaType: mediaType as MediaType,
      isRewatch: priorCount > 0,
      watchedAt,
    },
  });

  // Keep the summary row in sync: mark watched on the first log, but NEVER
  // bump watchedAt on later logs — Watch history keeps the first-watch order;
  // rewatch recency lives in the Rewatched shelf (max WatchEvent.watchedAt).
  const existing = await prisma.watchedItem.findUnique({
    where: { userId_tmdbId_mediaType: { userId: auth.sub, tmdbId, mediaType: mediaType as MediaType } },
    select: { watchedAt: true },
  });
  if (!existing) {
    // Dated to the EARLIEST watch, not to this one. The row is a summary of "when
    // did this enter your history", and Watch history is ordered by that — so
    // stamping it with today would park a film you first saw in 2004 at the top
    // of the shelf the moment you logged a rewatch.
    //
    // This fires whenever no summary row exists, which is not only a genuine
    // first watch: deleting a title from Watch history removes the summary row
    // and deliberately keeps the diary, so the next log lands here with a pile of
    // earlier events already behind it. The new event is included in the query,
    // so a real first watch still resolves to its own date.
    const earliest = await prisma.watchEvent.findFirst({
      where: { userId: auth.sub, tmdbId, mediaType: mediaType as MediaType },
      orderBy: { watchedAt: 'asc' },
      select: { watchedAt: true },
    });
    await prisma.watchedItem.create({
      data: { userId: auth.sub, tmdbId, mediaType: mediaType as MediaType, watchedAt: earliest?.watchedAt ?? watchedAt },
    }).catch(e => {
      if ((e as { code?: string })?.code !== 'P2002') throw e;
    });
  }

  return ok({ event, count: priorCount + 1 }, priorCount > 0 ? 'Rewatch logged' : 'Watch logged', { status: 201 });
}

// The caller's own diary, newest watch first. With ?tmdbId=&mediaType= it
// returns just that title's entries (the movie page's "Seen 3x - last June 12").
export async function GET(req: NextRequest) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  const { searchParams } = new URL(req.url);
  const page = clampInt(searchParams.get('page'), 1, 1, 1_000_000);
  const limit = clampInt(searchParams.get('limit'), 40, 1, 100);

  const rawId = searchParams.get('tmdbId');
  const mediaType = searchParams.get('mediaType');

  const where: { userId: string; tmdbId?: string; mediaType?: MediaType } = { userId: auth.sub };
  if (rawId && mediaType && ['MOVIE', 'SHOW'].includes(mediaType)) {
    where.tmdbId = canonicalId(rawId);
    where.mediaType = mediaType as MediaType;
  }

  const [total, items] = await Promise.all([
    prisma.watchEvent.count({ where }),
    prisma.watchEvent.findMany({
      where,
      orderBy: [{ watchedAt: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
      select: { id: true, tmdbId: true, mediaType: true, isRewatch: true, watchedAt: true },
    }),
  ]);

  // An episode watched once, or a show finished once, has no diary entry — ticking
  // episodes never wrote one — so counted straight it read 0 ("Watched it again?")
  // where a film watched once reads "Seen 1×". The watch it does have stands in as
  // that first viewing: the episode's watched row, or the show's last episode.
  // Here only, and only until a log files the real one, which POST seeds from the
  // same date. Nothing is written. The stand-in has no id: there is no entry to
  // delete, and /diary never asks for a title with fewer than two.
  if (total === 0 && where.tmdbId && where.mediaType === 'SHOW') {
    const episode = parseEpisodeId(where.tmdbId);
    const firstViewing = episode
      ? await prisma.watchedEpisode.findUnique({
          where: { userId_showTmdbId_season_episode: { userId: auth.sub, showTmdbId: episode.showId, season: episode.season, episode: episode.episode } },
          select: { watchedAt: true },
        })
      : isShowId(where.tmdbId) ? await lastEpisodeWatched(auth.sub, where.tmdbId) : null;
    if (firstViewing) {
      const standIn = { id: null, tmdbId: where.tmdbId, mediaType: where.mediaType, isRewatch: false, watchedAt: firstViewing.watchedAt };
      return ok({ items: page === 1 ? [standIn] : [], page, limit, total: 1, hasMore: false });
    }
  }

  return ok({ items, page, limit, total, hasMore: page * limit < total });
}
