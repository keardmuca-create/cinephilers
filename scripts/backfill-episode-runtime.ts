// One-off: fill episodeRuntime on FilmMeta rows that predate the column.
//
// New shows populate it themselves — the metadata fetch writes it on the way
// through — but rows already in the table are never refetched just because a
// column appeared. Without this, "time watched" counts every episode of every
// existing series as zero minutes.
//
// Safe to re-run: it only touches shows still missing the field, and a series
// TMDB has no episode length for is left null rather than guessed.
//
//   npx tsx scripts/backfill-episode-runtime.ts
import 'dotenv/config';
import { config } from 'dotenv';
config({ path: '.env.local' }); // TMDB_API_KEY lives here, not in .env
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { fetchOneMeta } from '../src/app/api/meta/_fetch';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  const key = process.env.TMDB_API_KEY;
  if (!key) throw new Error('TMDB_API_KEY not set');

  const shows = await prisma.filmMeta.findMany({
    where: { mediaType: 'SHOW', episodeRuntime: null },
    select: { tmdbId: true, title: true },
  });
  console.log(`${shows.length} show(s) to fill`);

  let filled = 0;
  let unknown = 0;
  let failed = 0;

  for (const s of shows) {
    try {
      const meta = await fetchOneMeta(s.tmdbId, key);
      const mins = typeof meta.episodeRuntime === 'number' && meta.episodeRuntime > 0
        ? meta.episodeRuntime
        : null;
      await prisma.filmMeta.update({ where: { tmdbId: s.tmdbId }, data: { episodeRuntime: mins } });
      if (mins) { filled++; console.log(`  ${s.title}: ${mins} min/ep`); }
      else { unknown++; console.log(`  ${s.title}: TMDB has no episode length`); }
    } catch (err) {
      failed++;
      console.log(`  ${s.title}: FAILED — ${(err as Error).message}`);
    }
  }

  console.log(`\nfilled ${filled}, no length on TMDB ${unknown}, failed ${failed}`);
}

main().finally(() => prisma.$disconnect());
