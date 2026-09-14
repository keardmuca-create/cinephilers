import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';
import { canViewUserContent } from '@/lib/privacy';
import { localDay } from '@/lib/local-day';
import { dayWindow, episodeIdOf, isEpisodeId } from '@/lib/feed-groups';

// Every title behind one group card in the activity feed: someone's watchlist adds
// on one day, or their episodes of one show on one day. The card only carries six
// posters and a count, and the feed reads a capped window across everyone you
// follow, so the full list is asked for here, for one person, and counted by the
// same rules the feed uses — THEIR calendar day, and nothing stamped at an import.

export interface GroupEntry {
  tmdbId: string;
  mediaType: string;
  /** When it happened: added to the watchlist, or the latest of watched/rated/reviewed. */
  at: string;
  /** Episodes only: their score, when they rated it. */
  rating?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const IMPORT_WINDOW_MS = 10 * 60_000;

export async function GET(req: NextRequest) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  const params = req.nextUrl.searchParams;
  const username = (params.get('user') ?? '').toLowerCase();
  const kind = params.get('kind');
  const day = params.get('day') ?? '';
  const show = params.get('show') ?? '';

  if (!username) return err('user is required');
  if (kind !== 'watchlist' && kind !== 'episodes') return err('Invalid kind');
  const window = dayWindow(day);
  if (!window) return err('Invalid day');
  if (kind === 'episodes' && !/^tmdb-tv-\d{1,10}$/.test(show)) return err('Invalid show');
  const [from, to] = window;

  const owner = await prisma.user.findUnique({
    where: { username },
    select: { id: true, username: true, displayName: true, timezone: true },
  });
  if (!owner) return err('User not found', 404);
  if (!(await canViewUserContent(auth.sub, owner.id))) return err('This account is private', 403);

  // The day is the owner's, in their own zone, as the card counted it. The query
  // takes a window wide enough for any zone and localDay() narrows it to theirs.
  const onTheirDay = (t: Date) => localDay(owner.timezone, t) === day;

  // The feed only looks back thirty days, so a card can never name a day before it.
  const since = new Date(Date.now() - 30 * DAY_MS);
  const imports = await prisma.importActivity.findMany({
    where: { userId: owner.id, createdAt: { gte: since } },
    select: { createdAt: true },
  });
  const nearImport = (t: Date) => imports.some(i => Math.abs(i.createdAt.getTime() - t.getTime()) < IMPORT_WINDOW_MS);

  let entries: GroupEntry[];

  if (kind === 'watchlist') {
    const rows = await prisma.watchlistItem.findMany({
      where: { userId: owner.id, addedAt: { gte: from, lt: to } },
      orderBy: { addedAt: 'desc' },
      select: { tmdbId: true, mediaType: true, addedAt: true },
    });
    entries = rows
      .filter(r => onTheirDay(r.addedAt) && !nearImport(r.addedAt))
      .map(r => ({ tmdbId: r.tmdbId, mediaType: r.mediaType, at: r.addedAt.toISOString() }));
  } else {
    // An episode lands on the day of its LATEST watch, rating or review, as it does
    // on the card — so a rating tonight of an episode ticked last week is tonight's.
    // That means reading the show's episodes across the whole thirty days, not just
    // the one day, and folding them the way the feed does.
    const prefix = `${show}-S`;
    const bare = show.slice('tmdb-tv-'.length);
    const [ticks, ratings, reviews, rewatches] = await Promise.all([
      prisma.watchedEpisode.findMany({
        where: { userId: owner.id, showTmdbId: { in: [show, bare] }, watchedAt: { gte: since } },
        select: { showTmdbId: true, season: true, episode: true, watchedAt: true },
      }),
      prisma.rating.findMany({
        where: { userId: owner.id, mediaType: 'SHOW', tmdbId: { startsWith: prefix }, updatedAt: { gte: since } },
        select: { tmdbId: true, score: true, updatedAt: true },
      }),
      prisma.review.findMany({
        where: { userId: owner.id, mediaType: 'SHOW', tmdbId: { startsWith: prefix }, createdAt: { gte: since }, hidden: false },
        select: { tmdbId: true, createdAt: true },
      }),
      prisma.watchEvent.findMany({
        where: { userId: owner.id, mediaType: 'SHOW', isRewatch: true, tmdbId: { startsWith: prefix }, createdAt: { gte: since } },
        select: { tmdbId: true },
      }),
    ]);

    const rewatched = new Set(rewatches.map(r => r.tmdbId));
    const folded = new Map<string, { latest: number; rating?: number }>();
    const touch = (id: string, t: Date) => {
      const cur = folded.get(id) ?? { latest: 0 };
      cur.latest = Math.max(cur.latest, t.getTime());
      folded.set(id, cur);
      return cur;
    };
    for (const e of ticks) {
      if (nearImport(e.watchedAt)) continue;
      const id = episodeIdOf(e.showTmdbId, e.season, e.episode);
      if (rewatched.has(id)) continue; // the rewatch card owns that viewing
      touch(id, e.watchedAt);
    }
    for (const r of ratings) {
      if (nearImport(r.updatedAt) || !isEpisodeId(r.tmdbId)) continue;
      touch(r.tmdbId, r.updatedAt).rating = r.score;
    }
    for (const r of reviews) {
      if (nearImport(r.createdAt) || !isEpisodeId(r.tmdbId)) continue;
      touch(r.tmdbId, r.createdAt);
    }

    const order = (id: string) => {
      const m = /-S(\d+)E(\d+)$/.exec(id);
      return m ? Number(m[1]) * 10000 + Number(m[2]) : 0;
    };
    entries = [...folded.entries()]
      .filter(([, v]) => onTheirDay(new Date(v.latest)))
      // Newest first; a season marked at once shares one moment, so then in episode order.
      .sort(([a, va], [b, vb]) => (vb.latest - va.latest) || (order(a) - order(b)))
      .map(([id, v]) => ({ tmdbId: id, mediaType: 'SHOW', at: new Date(v.latest).toISOString(), rating: v.rating }));
  }

  return ok({
    owner: { username: owner.username, displayName: owner.displayName },
    kind,
    day,
    show: kind === 'episodes' ? show : null,
    entries,
  });
}
