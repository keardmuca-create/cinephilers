// Give every whole-show watched record the episodes it should have had.
//
// Before Step 2, marking a show watched wrote ONE row and ticked nothing under it.
// Those shows exist only as that row. The rebuild makes episodes the only record,
// so dropping the show rows without filling in their episodes first would erase
// those shows from history completely — 240-odd episodes of a show marked in one
// tap, gone.
//
// Only touches shows that have a watched record and NO episodes ticked. A show the
// user is partway through is left alone: 61/62 is a real answer, and "finishing"
// it on their behalf would be inventing something they didn't do.
//
// Specials (season 0) are excluded, matching the in-app whole-show mark — TMDB's
// episode count excludes them, so including them would read as more episodes than
// the show has.
//
// Episodes are stamped with the show record's own watchedAt, so history keeps the
// date the user actually marked it and nothing jumps to the top.
//
// Dry run by default. Pass --write to actually create rows.
//
//   npx tsx scripts/backfill-show-episodes.ts
//   npx tsx scripts/backfill-show-episodes.ts --write
import 'dotenv/config';
import { config } from 'dotenv';
config({ path: '.env.local' }); // TMDB_API_KEY lives here, not in .env
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const KEY = process.env.TMDB_API_KEY ?? '';
const WRITE = process.argv.includes('--write');

interface SeasonSummary { season_number: number }
interface EpisodeSummary { episode_number: number }

async function episodesFor(tmdbNum: string): Promise<{ season: number; episode: number }[]> {
  const showRes = await fetch(`https://api.themoviedb.org/3/tv/${tmdbNum}?api_key=${KEY}&language=en-US`);
  if (!showRes.ok) throw new Error(`TMDB show ${tmdbNum}: ${showRes.status}`);
  const show = await showRes.json() as { seasons?: SeasonSummary[]; name?: string };
  const seasons = (show.seasons ?? []).filter(s => s.season_number > 0);

  const out: { season: number; episode: number }[] = [];
  for (const s of seasons) {
    const res = await fetch(`https://api.themoviedb.org/3/tv/${tmdbNum}/season/${s.season_number}?api_key=${KEY}&language=en-US`);
    if (!res.ok) throw new Error(`TMDB season ${tmdbNum}/${s.season_number}: ${res.status}`);
    const data = await res.json() as { episodes?: EpisodeSummary[] };
    for (const e of data.episodes ?? []) out.push({ season: s.season_number, episode: e.episode_number });
  }
  return out;
}

async function main() {
  if (!KEY) { console.log('No TMDB_API_KEY — aborting.'); return; }
  console.log(WRITE ? '=== WRITING ===' : '=== DRY RUN (no writes) ===\n');

  const showRows = await prisma.watchedItem.findMany({
    where: { mediaType: 'SHOW' },
    select: { userId: true, tmdbId: true, watchedAt: true },
  });

  // One grouped query rather than one per show.
  const existing = await prisma.watchedEpisode.groupBy({
    by: ['userId', 'showTmdbId'],
    _count: { _all: true },
  });
  const haveEpisodes = new Map(existing.map(g => [`${g.userId}:${g.showTmdbId}`, g._count._all]));

  const users = await prisma.user.findMany({ select: { id: true, username: true } });
  const nameById = new Map(users.map(u => [u.id, u.username]));

  const titles = await prisma.filmMeta.findMany({
    where: { tmdbId: { in: showRows.map(s => s.tmdbId) } },
    select: { tmdbId: true, title: true, episodeCount: true },
  });
  const metaById = new Map(titles.map(t => [t.tmdbId, t]));

  let created = 0, skipped = 0, failed = 0;

  for (const row of showRows) {
    const key = `${row.userId}:${row.tmdbId}`;
    const already = haveEpisodes.get(key) ?? 0;
    const meta = metaById.get(row.tmdbId);
    const label = `@${nameById.get(row.userId) ?? row.userId} · ${meta?.title ?? row.tmdbId}`;

    if (already > 0) {
      console.log(`  SKIP  ${label} — ${already} episode(s) already ticked`);
      skipped++;
      continue;
    }

    const tmdbNum = row.tmdbId.replace('tmdb-tv-', '');
    let episodes: { season: number; episode: number }[];
    try {
      episodes = await episodesFor(tmdbNum);
    } catch (err) {
      console.log(`  FAIL  ${label} — ${(err as Error).message}`);
      failed++;
      continue;
    }
    if (episodes.length === 0) {
      console.log(`  FAIL  ${label} — TMDB returned no episodes`);
      failed++;
      continue;
    }

    console.log(`  ${WRITE ? 'WRITE' : 'WOULD'} ${label} — ${episodes.length} episodes, dated ${row.watchedAt.toISOString().slice(0, 10)}`);
    created += episodes.length;

    if (WRITE) {
      await prisma.watchedEpisode.createMany({
        data: episodes.map(e => ({
          userId: row.userId,
          showTmdbId: row.tmdbId,
          season: e.season,
          episode: e.episode,
          watchedAt: row.watchedAt,
        })),
        skipDuplicates: true,
      });
    }
  }

  console.log(`\n${WRITE ? 'Created' : 'Would create'} ${created} episode rows · ${skipped} shows skipped · ${failed} failed`);
  if (!WRITE) console.log('Nothing was written. Re-run with --write to apply.');
}

main().finally(() => prisma.$disconnect());
