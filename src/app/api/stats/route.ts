import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';

export async function GET(req: NextRequest) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  const userId = auth.sub;
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);

  const [watched, ratings, reviewsCount, episodesByShow] = await Promise.all([
    prisma.watchedItem.findMany({
      where: { userId },
      select: { tmdbId: true, mediaType: true, watchedAt: true },
      orderBy: { watchedAt: 'asc' },
    }),
    prisma.rating.findMany({
      where: { userId },
      select: { score: true },
    }),
    prisma.review.count({ where: { userId } }),
    // Episodes are where a series' hours actually are. Grouped in the database
    // rather than counted here — 602 rows today, but somebody who ticks through
    // several long shows will have thousands.
    prisma.watchedEpisode.groupBy({
      by: ['showTmdbId'],
      where: { userId },
      _count: { _all: true },
    }),
  ]);

  // Totals
  const totalWatched = watched.length;
  const totalMovies = watched.filter(w => w.mediaType === 'MOVIE').length;
  const totalShows = watched.filter(w => w.mediaType === 'SHOW').length;

  // This year
  const watchedThisYear = watched.filter(w => w.watchedAt >= yearStart).length;

  // Ratings
  const totalRatings = ratings.length;
  const avgScore = totalRatings > 0
    ? Math.round((ratings.reduce((sum, r) => sum + r.score, 0) / totalRatings) * 10) / 10
    : null;

  // ── Time watched ────────────────────────────────────────────────────────────
  //
  // Films are the easy half: a runtime per title, stored on FilmMeta already.
  //
  // Series are counted per EPISODE, not per series, because a show marked
  // watched says nothing about how long it was — Breaking Bad and a two-part
  // documentary both count as one row. Episode length is an average per show
  // (TMDB gives one number for the whole series), so this is an estimate and is
  // presented as one: days and hours, never minutes.
  //
  // A title with no runtime stored contributes zero rather than a guess. It
  // undercounts slightly, which is the right direction — a number that claims
  // more than it can prove is worse than one that admits a gap.
  const showIds = new Set<string>([
    ...episodesByShow.map(e => e.showTmdbId),
    ...watched.filter(w => w.mediaType === 'SHOW').map(w => w.tmdbId),
  ]);
  const metaIds = [...new Set([
    ...watched.filter(w => w.mediaType === 'MOVIE').map(w => w.tmdbId),
    ...showIds,
  ])];

  const metaRows = metaIds.length
    ? await prisma.filmMeta.findMany({
        where: { tmdbId: { in: metaIds } },
        select: { tmdbId: true, runtime: true, episodeRuntime: true, episodeCount: true },
      })
    : [];
  const metaById = new Map(metaRows.map(m => [m.tmdbId, m]));

  const filmMinutes = watched
    .filter(w => w.mediaType === 'MOVIE')
    .reduce((sum, w) => sum + (metaById.get(w.tmdbId)?.runtime ?? 0), 0);

  const episodeCountByShow = new Map(episodesByShow.map(e => [e.showTmdbId, e._count._all]));

  let showMinutes = 0;
  for (const id of showIds) {
    const meta = metaById.get(id);
    if (!meta?.episodeRuntime) continue;
    // Ticked episodes are the truth when they exist. A series marked watched at
    // show level with none of them ticked is credited its full episode count —
    // that mark means "I have seen this", and pricing it at zero would be the
    // more wrong of the two answers.
    const episodes = episodeCountByShow.get(id) ?? meta.episodeCount ?? 0;
    showMinutes += episodes * meta.episodeRuntime;
  }

  // Monthly activity — last 12 months
  const months: { month: string; count: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    const count = watched.filter(w => w.watchedAt >= d && w.watchedAt < end).length;
    months.push({ month: label, count });
  }

  return ok({
    totalWatched,
    totalMovies,
    totalShows,
    // Minutes, so the client decides how to say it. Split because the total on
    // its own invites "from what?" — and because a films number and a series
    // number are two different kinds of viewing life.
    watchMinutes: {
      films: filmMinutes,
      shows: showMinutes,
      total: filmMinutes + showMinutes,
    },
    watchedThisYear,
    totalRatings,
    avgScore,
    reviewsCount,
    monthlyActivity: months,
  });
}
