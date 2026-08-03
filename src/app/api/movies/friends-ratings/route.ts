import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';
import { describeShowProgress, type SeasonCounts } from '@/lib/show-progress';

export async function GET(req: NextRequest) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  const tmdbId = req.nextUrl.searchParams.get('tmdbId');
  if (!tmdbId) return err('tmdbId required', 400);

  // Every query below filters on "belongs to someone I follow" directly rather than
  // fetching the follow list first and waiting for it. That list was one full round
  // trip to the database that every other query sat behind, and this page's whole
  // job is to appear promptly. One trip now, not two.
  const followedByMe = { followers: { some: { followerId: auth.sub } } };

  const userSelect = {
    select: { id: true, username: true, displayName: true, avatarUrl: true },
  };

  // For a show, a friend's progress lives in WatchedEpisode, which this endpoint
  // never looked at — so someone who watched one episode for a guest star (or
  // three whole seasons) appeared nowhere at all, not merely without an eye.
  // Grouped by season rather than fetched episode by episode: naming a finished
  // season only needs counts.
  // An episode id starts with tmdb-tv- too, and this route serves episode pages
  // as well — but an episode has no episodes of its own, so treating one as a
  // show just costs two queries that can't match anything.
  const isShow = tmdbId.startsWith('tmdb-tv-') && !/-S\d+E\d+$/.test(tmdbId);

  // Friends who only ever ticked episodes have no row in any of the other tables, so
  // their user records are fetched too. That used to wait on the groupBy to learn
  // which ids to ask for; asked this way it describes the same people without needing
  // the answer first, so it joins the parallel batch instead of trailing it.
  const [ratings, watched, reviews, watchlisted, episodeGroups, episodeUsers, showMeta] = await Promise.all([
    prisma.rating.findMany({
      where: { tmdbId, user: followedByMe },
      include: { user: userSelect },
    }),
    prisma.watchedItem.findMany({
      where: { tmdbId, user: followedByMe },
      include: { user: userSelect },
    }),
    prisma.review.findMany({
      where: { tmdbId, hidden: false, user: followedByMe },
      include: { user: userSelect },
    }),
    prisma.watchlistItem.findMany({
      where: { tmdbId, user: followedByMe },
      include: { user: userSelect },
    }),
    isShow
      ? prisma.watchedEpisode.groupBy({
          by: ['userId', 'season'],
          where: { showTmdbId: tmdbId, user: followedByMe },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    isShow
      ? prisma.user.findMany({
          where: { ...followedByMe, watchedEpisodes: { some: { showTmdbId: tmdbId } } },
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        })
      : Promise.resolve([]),
    isShow
      ? prisma.filmMeta.findUnique({
          where: { tmdbId },
          select: { episodeCount: true, seasonCounts: true },
        })
      : Promise.resolve(null),
  ]);

  const map = new Map<string, {
    user: { id: string; username: string; displayName: string | null; avatarUrl: string | null };
    rating: number | null;
    watched: boolean;
    reviewed: boolean;
    inWatchlist: boolean;
    /** Shows only: "Completed", "Season 1", "13 / 62", "1 episode". */
    progress?: string;
  }>();

  const blank = (user: { id: string; username: string; displayName: string | null; avatarUrl: string | null }) =>
    ({ user, rating: null as number | null, watched: false, reviewed: false, inWatchlist: false });

  for (const w of watched) {
    map.set(w.userId, { ...blank(w.user), watched: true });
  }
  for (const r of ratings) {
    const entry = map.get(r.userId) ?? map.set(r.userId, blank(r.user)).get(r.userId)!;
    entry.rating = r.score;
  }
  for (const r of reviews) {
    const entry = map.get(r.userId) ?? map.set(r.userId, blank(r.user)).get(r.userId)!;
    entry.reviewed = true;
  }
  // Friends who saved it for later — they appear too, even with no other activity.
  for (const w of watchlisted) {
    const entry = map.get(w.userId) ?? map.set(w.userId, blank(w.user)).get(w.userId)!;
    entry.inWatchlist = true;
  }

  // Episode progress last, so it can add friends the other tables never saw and
  // describe the ones they did.
  if (isShow && episodeGroups.length > 0) {
    const userById = new Map(episodeUsers.map(u => [u.id, u]));
    const bySeasonPerUser = new Map<string, Map<number, number>>();
    for (const g of episodeGroups) {
      const seasons = bySeasonPerUser.get(g.userId) ?? new Map<number, number>();
      seasons.set(g.season, g._count._all);
      bySeasonPerUser.set(g.userId, seasons);
    }

    const seasonCounts = (showMeta?.seasonCounts ?? undefined) as SeasonCounts | undefined;
    const totalEpisodes = showMeta?.episodeCount ?? 0;

    for (const [userId, seasons] of bySeasonPerUser) {
      const user = userById.get(userId);
      if (!user) continue;
      const entry = map.get(userId) ?? map.set(userId, blank(user)).get(userId)!;
      const progress = describeShowProgress(seasons, seasonCounts, totalEpisodes);
      entry.progress = progress.label;
      // Finishing a show is watching it, whether or not a show-level record exists.
      if (progress.complete) entry.watched = true;
    }
  }

  return ok(Array.from(map.values()));
}
