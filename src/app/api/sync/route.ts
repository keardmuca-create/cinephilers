import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';

export async function GET(req: NextRequest) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  const [ratings, watchlist, watched, watchedEpisodes, reviews, favorites, lists, hidden] = await Promise.all([
    prisma.rating.findMany({ where: { userId: auth.sub }, select: { tmdbId: true, mediaType: true, score: true, createdAt: true, updatedAt: true } }),
    // Deterministic order: items with identical timestamps (bulk imports) must
    // restore in the same sequence every login, or "Date added" sorts reshuffle.
    prisma.watchlistItem.findMany({ where: { userId: auth.sub }, select: { tmdbId: true, mediaType: true, addedAt: true }, orderBy: [{ addedAt: 'asc' }, { tmdbId: 'asc' }] }),
    prisma.watchedItem.findMany({ where: { userId: auth.sub }, select: { tmdbId: true, mediaType: true, watchedAt: true }, orderBy: [{ watchedAt: 'asc' }, { tmdbId: 'asc' }] }),
    // Ticked episodes. Without these a device that didn't do the ticking has no
    // idea a show is 61/62 watched — the rows are in the DB, but Watch History
    // reads localStorage, so the progress simply wasn't there on a new phone or
    // after a browser-data clear.
    prisma.watchedEpisode.findMany({
      where: { userId: auth.sub },
      select: { showTmdbId: true, season: true, episode: true, watchedAt: true },
      orderBy: [{ showTmdbId: 'asc' }, { season: 'asc' }, { episode: 'asc' }],
    }),
    prisma.review.findMany({
      // Exclude moderator-hidden reviews so a removed review doesn't sync back
      // into the author's own device and reappear on their profile.
      where: { userId: auth.sub, hidden: false },
      select: { tmdbId: true, mediaType: true, body: true, containsSpoiler: true, createdAt: true },
    }),
    prisma.favorite.findMany({ where: { userId: auth.sub }, select: { tmdbId: true, mediaType: true, addedAt: true }, orderBy: { addedAt: 'asc' } }),
    prisma.customList.findMany({
      where: { userId: auth.sub },
      orderBy: { createdAt: 'desc' },
      include: { items: { orderBy: { addedAt: 'asc' } } },
    }),
    prisma.hiddenActivity.findMany({ where: { userId: auth.sub }, select: { type: true, tmdbId: true } }),
  ]);

  return ok({ ratings, watchlist, watched, watchedEpisodes, reviews, favorites, lists, hidden });
}
