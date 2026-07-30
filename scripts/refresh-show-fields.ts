// One-off: fill episodeCount / showStatus / showType on FilmMeta rows that
// predate those columns.
//
// The main backfill only fetches ids MISSING from the table, so it skips rows
// that already exist and would never populate new columns. This refetches shows
// specifically and updates just the three fields.
//
// Safe to re-run: it only touches rows still missing episodeCount.
//
//   npx tsx scripts/refresh-show-fields.ts
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
    where: { mediaType: 'SHOW', episodeCount: null },
    select: { tmdbId: true, title: true },
  });
  console.log(`${shows.length} show(s) to refresh`);

  let ok = 0;
  let failed = 0;
  for (const s of shows) {
    try {
      const meta = await fetchOneMeta(s.tmdbId, key);
      await prisma.filmMeta.update({
        where: { tmdbId: s.tmdbId },
        data: {
          episodeCount: typeof meta.totalEps === 'number' && meta.totalEps > 0 ? meta.totalEps : null,
          showStatus: meta.tmdbStatus ?? null,
          showType: meta.showType ?? null,
        },
      });
      console.log(`  ok  ${s.title} — ${meta.totalEps} eps, ${meta.tmdbStatus}, ${meta.showType}`);
      ok++;
    } catch (e) {
      console.log(`  FAIL ${s.title}: ${(e as Error).message}`);
      failed++;
    }
  }
  console.log(`done: ${ok} updated, ${failed} failed`);
}

main().finally(() => prisma.$disconnect());
