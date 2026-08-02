// Remove the show-level watched records now that episodes are the only record.
//
// A show used to be remembered twice: once as its own WatchedItem row and once
// as the episodes under it. That is what allowed the two to disagree — marking a
// show ticked no episodes, ticking every episode never marked the show. Every
// screen now derives a show's state from its episodes, so the row is redundant,
// and the last code that wrote one has been removed.
//
// Refuses to delete any row that has NO episodes under it: that would be the one
// case where the row is the only record of the watch, and deleting it would lose
// the show entirely. Run scripts/backfill-show-episodes.ts first if any turn up.
//
// Dry run by default. Pass --write to actually delete.
//
//   npx tsx scripts/drop-show-watched-records.ts
//   npx tsx scripts/drop-show-watched-records.ts --write
import 'dotenv/config';
import { config } from 'dotenv';
config({ path: '.env.local' });
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const WRITE = process.argv.includes('--write');

async function main() {
  console.log(WRITE ? '=== WRITING ===' : '=== DRY RUN (no writes) ===');

  const rows = await prisma.watchedItem.findMany({
    where: { mediaType: 'SHOW' },
    select: { id: true, userId: true, tmdbId: true },
  });
  const groups = await prisma.watchedEpisode.groupBy({ by: ['userId', 'showTmdbId'], _count: { _all: true } });
  const episodes = new Map(groups.map(g => [`${g.userId}:${g.showTmdbId}`, g._count._all]));

  const users = await prisma.user.findMany({ select: { id: true, username: true } });
  const name = new Map(users.map(u => [u.id, u.username]));
  const meta = await prisma.filmMeta.findMany({
    where: { tmdbId: { in: rows.map(r => r.tmdbId) } },
    select: { tmdbId: true, title: true },
  });
  const title = new Map(meta.map(m => [m.tmdbId, m.title]));

  const safe: string[] = [];
  let skipped = 0;
  for (const r of rows) {
    const n = episodes.get(`${r.userId}:${r.tmdbId}`) ?? 0;
    const label = `@${name.get(r.userId) ?? r.userId} · ${title.get(r.tmdbId) ?? r.tmdbId}`;
    if (n === 0) {
      console.log(`  SKIP  ${label} — no episodes under it, this row is the only record`);
      skipped++;
      continue;
    }
    console.log(`  ${WRITE ? 'DROP ' : 'WOULD'} ${label} — ${n} episodes carry it`);
    safe.push(r.id);
  }

  if (WRITE && safe.length > 0) {
    const { count } = await prisma.watchedItem.deleteMany({ where: { id: { in: safe } } });
    console.log(`\nDeleted ${count} rows · ${skipped} skipped`);
  } else {
    console.log(`\n${WRITE ? 'Deleted 0' : `Would delete ${safe.length}`} rows · ${skipped} skipped`);
    if (!WRITE) console.log('Nothing was written. Re-run with --write to apply.');
  }
}

main().finally(() => prisma.$disconnect());
