// One-off: fill seasonCounts on FilmMeta rows that predate the column.
//
// Same reason refresh-show-fields.ts exists — the main backfill only fetches ids
// MISSING from the table, so it never populates a new column on rows already
// there. This refetches shows specifically and updates just that one field.
//
// Safe to re-run: only touches shows still missing seasonCounts.
//
//   npx tsx scripts/refresh-season-counts.ts
import 'dotenv/config';
import { config } from 'dotenv';
config({ path: '.env.local' }); // TMDB_API_KEY lives here, not in .env
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const KEY = process.env.TMDB_API_KEY ?? '';

async function main() {
  if (!KEY) { console.log('No TMDB_API_KEY — aborting.'); return; }

  // Filtered in JS, not SQL: Prisma distinguishes a JSON null from a SQL NULL,
  // so `equals: null` on a Json column silently matches neither.
  const all = await prisma.filmMeta.findMany({
    where: { mediaType: 'SHOW' },
    select: { tmdbId: true, title: true, seasonCounts: true },
  });
  const shows = all.filter(s => s.seasonCounts == null);
  console.log(`${shows.length} of ${all.length} show(s) missing seasonCounts`);

  for (const show of shows) {
    const num = show.tmdbId.replace('tmdb-tv-', '');
    try {
      const res = await fetch(`https://api.themoviedb.org/3/tv/${num}?api_key=${KEY}&language=en-US`);
      if (!res.ok) { console.log(`  FAIL ${show.title} — TMDB ${res.status}`); continue; }
      const d = await res.json() as { seasons?: { season_number?: number; episode_count?: number }[] };

      const counts: Record<string, number> = {};
      for (const s of d.seasons ?? []) {
        // Specials (season 0) are excluded, matching episodeCount.
        if (typeof s?.season_number !== 'number' || s.season_number <= 0) continue;
        if (typeof s.episode_count !== 'number' || s.episode_count <= 0) continue;
        counts[String(s.season_number)] = s.episode_count;
      }
      if (Object.keys(counts).length === 0) { console.log(`  FAIL ${show.title} — no seasons`); continue; }

      await prisma.filmMeta.update({ where: { tmdbId: show.tmdbId }, data: { seasonCounts: counts } });
      const summary = Object.entries(counts).map(([s, n]) => `S${s}:${n}`).join(' ');
      console.log(`  OK   ${show.title} — ${summary}`);
    } catch (err) {
      console.log(`  FAIL ${show.title} — ${(err as Error).message}`);
    }
  }
}

main().finally(() => prisma.$disconnect());
