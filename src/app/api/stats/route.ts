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

  const [watched, ratings, reviewsCount, watchedEpisodes] = await Promise.all([
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
    // Every episode individually, not a count per show: each one is looked up by
    // its own runtime below, so which episodes matters and not merely how many.
    prisma.watchedEpisode.findMany({
      where: { userId },
      select: { showTmdbId: true, season: true, episode: true, watchedAt: true },
    }),
  ]);

  // Totals
  const totalWatched = watched.length;
  const totalMovies = watched.filter(w => w.mediaType === 'MOVIE').length;

  // Shows are counted from EPISODES, not from WatchedItem.
  //
  // A WatchedItem row with mediaType SHOW only exists if someone marked an
  // entire series watched in one action. Anybody who watches television the
  // ordinary way — episode by episode — produces no such row at all, so counting
  // them read 0 for a person with hundreds of episodes behind them. Episodes are
  // the record in this app; the show is what they add up to.
  //
  // A show counts once you have watched an episode of it. Whole-series marks are
  // unioned in, so a user who logs that way is not dropped either, and a show
  // logged both ways is still one show.
  const startedShows = new Set<string>(watchedEpisodes.map(e => e.showTmdbId));
  for (const w of watched) if (w.mediaType === 'SHOW') startedShows.add(w.tmdbId);
  const totalShows = startedShows.size;

  // This year — films by their own watch date, shows by whether an episode of
  // them landed inside the year. A series begun in 2025 and continued in 2026
  // counts in both, which is the honest answer to "what did I watch this year".
  const thisYear = watched.filter(w => w.watchedAt >= yearStart);
  const watchedThisYear = thisYear.length;
  const moviesThisYear = thisYear.filter(w => w.mediaType === 'MOVIE').length;

  const showsThisYearSet = new Set<string>(
    watchedEpisodes.filter(e => e.watchedAt >= yearStart).map(e => e.showTmdbId),
  );
  for (const w of thisYear) if (w.mediaType === 'SHOW') showsThisYearSet.add(w.tmdbId);
  const showsThisYear = showsThisYearSet.size;

  // Ratings
  const totalRatings = ratings.length;
  const avgScore = totalRatings > 0
    ? Math.round((ratings.reduce((sum, r) => sum + r.score, 0) / totalRatings) * 10) / 10
    : null;

  // ── Time watched ────────────────────────────────────────────────────────────
  //
  // Films are the easy half: a runtime per title, stored on FilmMeta already.
  //
  // Series are counted per EPISODE, and each episode by its own runtime — not by
  // a series average, which was arithmetic on an estimate and could be hours out
  // over a long run. The app states this figure to the minute, so the minutes
  // are the real ones.
  //
  // A title with no runtime stored contributes zero rather than a guess. It
  // undercounts slightly, which is the right direction — a number that claims
  // more than it can prove is worse than one that admits a gap.
  const showIds = new Set<string>([
    ...watchedEpisodes.map(e => e.showTmdbId),
    ...watched.filter(w => w.mediaType === 'SHOW').map(w => w.tmdbId),
  ]);
  const metaIds = [...new Set([
    ...watched.filter(w => w.mediaType === 'MOVIE').map(w => w.tmdbId),
    ...showIds,
  ])];

  const metaRows = metaIds.length
    ? await prisma.filmMeta.findMany({
        where: { tmdbId: { in: metaIds } },
        select: {
          tmdbId: true, runtime: true,
          episodeRuntime: true, episodeRuntimes: true, episodeCount: true,
        },
      })
    : [];
  const metaById = new Map(metaRows.map(m => [m.tmdbId, m]));

  const filmMinutes = watched
    .filter(w => w.mediaType === 'MOVIE')
    .reduce((sum, w) => sum + (metaById.get(w.tmdbId)?.runtime ?? 0), 0);

  /** This exact episode's runtime, falling back to the series average. */
  const runtimeOf = (
    map: Record<string, Record<string, number>> | null,
    average: number | null,
    season: number,
    episode: number,
  ): number => map?.[String(season)]?.[String(episode)] ?? average ?? 0;

  // Each watched episode contributes its OWN length. Counting episodes and
  // multiplying by an average was arithmetic on an estimate: Breaking Bad runs
  // 43 to 58 minutes an episode and every one of them counted as 50, so a
  // finished series could be hours out — in a figure the app states to the
  // minute.
  let showMinutes = 0;
  for (const e of watchedEpisodes) {
    const meta = metaById.get(e.showTmdbId);
    if (!meta) continue;
    showMinutes += runtimeOf(
      meta.episodeRuntimes as Record<string, Record<string, number>> | null,
      meta.episodeRuntime,
      e.season,
      e.episode,
    );
  }

  // A series marked watched at show level with no episodes ticked still means "I
  // have seen this", and zero would be the more wrong answer. Its whole run is
  // credited — every stored episode runtime, or the episode count times the
  // average when the map is missing.
  const showsWithTickedEpisodes = new Set(watchedEpisodes.map(e => e.showTmdbId));
  for (const id of showIds) {
    if (showsWithTickedEpisodes.has(id)) continue;
    const meta = metaById.get(id);
    if (!meta) continue;
    const map = meta.episodeRuntimes as Record<string, Record<string, number>> | null;
    if (map) {
      showMinutes += Object.values(map).flatMap(s => Object.values(s)).reduce((a, b) => a + b, 0);
    } else if (meta.episodeRuntime) {
      showMinutes += (meta.episodeCount ?? 0) * meta.episodeRuntime;
    }
  }

  // Monthly activity — last 12 months, films and episodes counted separately.
  //
  // They are deliberately NOT summed into one series. A film and an episode are
  // not the same unit, so "1 film + 20 episodes = 21" describes nothing anyone
  // watches, and that sum is what the single blended series used to plot.
  //
  // Films come from WatchedItem (MOVIE only — a show marked watched there is one
  // row for a whole series, which would be a single notch beside a month of
  // episodes). Episodes come from WatchedEpisode, each with its own date.
  const months: { month: string; movies: number; episodes: number }[] = [];
  const movieRows = watched.filter(w => w.mediaType === 'MOVIE');
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    months.push({
      month: label,
      movies: movieRows.filter(w => w.watchedAt >= d && w.watchedAt < end).length,
      episodes: watchedEpisodes.filter(e => e.watchedAt >= d && e.watchedAt < end).length,
    });
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
    moviesThisYear,
    showsThisYear,
    totalRatings,
    avgScore,
    reviewsCount,
    monthlyActivity: months,
  });
}
