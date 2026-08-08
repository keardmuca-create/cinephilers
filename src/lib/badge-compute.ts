// Work out a user's badges from the database, so other people can see them.
//
// Badges used to be computed in the browser from localStorage, which meant they
// differed per device and could never appear on anyone else's profile. Everything
// they need now lives on the server, so this is the one place that counts it.
//
// It always recomputes from scratch rather than nudging a stored number up or
// down. That's deliberate: a badge that's incremented on "watched" and forgotten
// on "removed" is how a gold medal ends up on an empty library. Starting from the
// current data means deleting a film lowers the badge without anything having to
// remember to.

import { prisma } from '@/lib/db';
import { snapshotFrom, type EarnedBadge, type BadgeSnapshot } from '@/lib/badge-defs';
import { localDay, daysBetween } from '@/lib/local-day';

export type { EarnedBadge, BadgeSnapshot };

const isEpisodeId = (id: string) => /-S\d+E\d+$/.test(id);

/** Every badge count for one user, straight from the database. */
export async function computeBadgeCounts(userId: string): Promise<Record<string, number>> {
  const [films, episodeGroups, ratings, reviews, picks, pickWatches, user] = await Promise.all([
    prisma.watchedItem.findMany({ where: { userId, mediaType: 'MOVIE' }, select: { tmdbId: true } }),
    prisma.watchedEpisode.groupBy({
      by: ['showTmdbId'],
      where: { userId },
      _count: { _all: true },
    }),
    prisma.rating.findMany({ where: { userId }, select: { tmdbId: true, mediaType: true } }),
    prisma.review.count({ where: { userId, hidden: false } }),
    // Films only — a series keeps no watched record of its own, and the pick card
    // only offers Mark as watched for films.
    prisma.dailyPick.findMany({
      where: { userId, mediaType: 'MOVIE' },
      select: { tmdbId: true, day: true, createdAt: true },
    }),
    prisma.watchEvent.findMany({
      where: { userId, mediaType: 'MOVIE' },
      select: { tmdbId: true, watchedAt: true },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } }),
  ]);

  // One meta lookup covers both the languages for World cinema and the episode
  // totals that decide whether a show counts as finished.
  const ids = [...films.map(f => f.tmdbId), ...episodeGroups.map(g => g.showTmdbId)];
  const meta = ids.length
    ? await prisma.filmMeta.findMany({
        where: { tmdbId: { in: ids } },
        select: { tmdbId: true, language: true, episodeCount: true },
      })
    : [];
  const metaById = new Map(meta.map(m => [m.tmdbId, m]));

  const languages = new Set(
    films.map(f => metaById.get(f.tmdbId)?.language).filter((l): l is string => !!l),
  );

  let episodesWatched = 0;
  let showsCompleted = 0;
  for (const g of episodeGroups) {
    episodesWatched += g._count._all;
    const total = metaById.get(g.showTmdbId)?.episodeCount ?? 0;
    if (total > 0 && g._count._all >= total) showsCompleted++;
  }

  // Ratings are all stored under one table, so what they're FOR comes from the
  // shape of the id — the same rule the ratings list uses. An episode is not a
  // rating of its series.
  let filmsRated = 0;
  let episodesRated = 0;
  const showsRated = new Set<string>();
  for (const r of ratings) {
    if (isEpisodeId(r.tmdbId)) episodesRated++;
    else if (r.mediaType === 'SHOW') showsRated.add(r.tmdbId);
    else filmsRated++;
  }

  // ── Today's Pick ────────────────────────────────────────────────────────────
  // A pick counts only when the film was watched AFTER the pick was made and
  // inside the same day — the day being the user's own, from the zone stored on
  // their account. Same day, no grace: Keard's call, and the point of the badge
  // is watching it tonight rather than eventually.
  //
  // The "after the pick was made" half is what makes these two badges
  // unforgeable. An import can create any number of watch events on any dates it
  // likes, but it cannot create a DailyPick row, and it cannot land a watch after
  // a pick that had not happened yet.
  const watchesByTitle = new Map<string, Date[]>();
  for (const w of pickWatches) {
    const list = watchesByTitle.get(w.tmdbId);
    if (list) list.push(w.watchedAt);
    else watchesByTitle.set(w.tmdbId, [w.watchedAt]);
  }

  const completedDays: string[] = [];
  for (const pick of picks) {
    const watches = watchesByTitle.get(pick.tmdbId);
    if (!watches) continue;
    const done = watches.some(at =>
      at.getTime() >= pick.createdAt.getTime() &&
      localDay(user?.timezone, at) === pick.day,
    );
    if (done) completedDays.push(pick.day);
  }

  // Longest run ever, not the current one — see the badge definition.
  completedDays.sort();
  let bestStreak = 0;
  let run = 0;
  let prev: string | null = null;
  for (const day of completedDays) {
    if (prev !== null && daysBetween(prev, day) === 1) run++;
    else run = 1;
    if (run > bestStreak) bestStreak = run;
    prev = day;
  }

  return {
    'daily-pick': completedDays.length,
    'pick-streak': bestStreak,
    'movie-watcher': films.length,
    'movie-rater': filmsRated,
    'show-watcher': showsCompleted,
    'show-rater': showsRated.size,
    'episodes-watched': episodesWatched,
    'episode-rater': episodesRated,
    'reviewer': reviews,
    'world-cinema': languages.size,
    // Founder isn't earned by activity — having an account is the whole of it.
    'founder': 1,
  };
}

export async function computeBadges(userId: string): Promise<BadgeSnapshot> {
  return snapshotFrom(await computeBadgeCounts(userId));
}

// How long a stored snapshot is served before it's rebuilt. Badges lagging a few
// minutes costs nothing; hooking every write path to keep them exact is what
// costs — that's the road to a badge nobody remembered to decrement.
const STALE_AFTER_MS = 5 * 60 * 1000;

/**
 * A user's badges, rebuilt only when the stored copy has gone stale. `force`
 * skips the cache so someone always sees their own badges up to date.
 */
export async function getBadges(userId: string, { force = false } = {}): Promise<BadgeSnapshot> {
  if (!force) {
    const stored = await prisma.userBadges.findUnique({ where: { userId } });
    if (stored && Date.now() - stored.computedAt.getTime() < STALE_AFTER_MS) {
      return { badges: stored.badges as unknown as EarnedBadge[], computedAt: stored.computedAt.toISOString() };
    }
  }

  const snapshot = await computeBadges(userId);
  const data = { badges: snapshot.badges as unknown as object, computedAt: new Date() };
  await prisma.userBadges.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
  return snapshot;
}
