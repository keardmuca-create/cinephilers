// One-off: fill episode runtimes on FilmMeta rows that predate the columns.
//
// Two fields, and the second is the one that matters:
//   episodeRuntime   one average for the series — the fallback
//   episodeRuntimes  every episode's own runtime, season -> episode -> minutes
//
// New shows fill both on the way through the metadata fetch, but rows already in
// the table are never refetched just because a column appeared. Without this,
// every episode of every existing series is either zero minutes or an average.
//
// Safe to re-run: it only touches shows still missing one of the two, and a
// series TMDB has nothing for is left null rather than guessed at.
//
//   npx tsx scripts/backfill-episode-runtime.ts
import 'dotenv/config';
import { config } from 'dotenv';
config({ path: '.env.local' }); // TMDB_API_KEY lives here, not in .env
import { PrismaClient, Prisma } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { fetchOneMeta } from '../src/app/api/meta/_fetch';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  const key = process.env.TMDB_API_KEY;
  if (!key) throw new Error('TMDB_API_KEY not set');

  const shows = await prisma.filmMeta.findMany({
    where: {
      mediaType: 'SHOW',
      OR: [{ episodeRuntime: null }, { episodeRuntimes: { equals: Prisma.DbNull } }],
    },
    select: { tmdbId: true, title: true },
  });
  console.log(`${shows.length} show(s) to fill`);

  let filled = 0;
  let unknown = 0;
  let failed = 0;

  for (const show of shows) {
    try {
      const meta = await fetchOneMeta(show.tmdbId, key);
      const average = typeof meta.episodeRuntime === 'number' && meta.episodeRuntime > 0
        ? meta.episodeRuntime
        : null;
      const exact = Object.values(meta.episodeRuntimes ?? {})
        .flatMap(season => Object.values(season));

      await prisma.filmMeta.update({
        where: { tmdbId: show.tmdbId },
        data: { episodeRuntime: average, episodeRuntimes: meta.episodeRuntimes ?? undefined },
      });

      if (exact.length > 0) {
        filled++;
        const total = exact.reduce((a, b) => a + b, 0);
        console.log(
          `  ${show.title}: ${exact.length} episodes, ${Math.min(...exact)}-${Math.max(...exact)} min each, ${total} min in total`,
        );
      } else if (average) {
        filled++;
        console.log(`  ${show.title}: no per-episode data, average only (${average} min/ep)`);
      } else {
        unknown++;
        console.log(`  ${show.title}: TMDB has no runtime at all`);
      }
    } catch (err) {
      failed++;
      console.log(`  ${show.title}: FAILED — ${(err as Error).message}`);
    }
  }

  console.log(`\nfilled ${filled}, nothing on TMDB ${unknown}, failed ${failed}`);
}

main().finally(() => prisma.$disconnect());
