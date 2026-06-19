import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Older watched rows were saved with a bare numeric tmdbId (e.g. "274854")
// instead of the canonical "tmdb-274854". The same item in both formats can
// produce duplicate watched entries. This brings every bare-numeric row in
// line with how /api/watched now writes IDs.
//
// Dry run by default. Pass --apply to actually write changes.

const apply = process.argv.includes('--apply');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const all = await prisma.watchedItem.findMany({
    select: { id: true, userId: true, tmdbId: true, mediaType: true },
  });

  const bare = all.filter(w => /^\d+$/.test(w.tmdbId));

  // Track which (user, id, mediaType) combos already exist so we never rename
  // a bare row onto an id that's already taken (would break the unique key).
  const existing = new Set(all.map(w => `${w.userId}|${w.tmdbId}|${w.mediaType}`));

  const toUpdate: { id: string; target: string }[] = [];
  const toDelete: { id: string }[] = [];

  for (const w of bare) {
    const target = `tmdb-${w.tmdbId}`;
    const key = `${w.userId}|${target}|${w.mediaType}`;
    if (existing.has(key)) {
      toDelete.push({ id: w.id }); // prefixed twin already exists — this bare row is a duplicate
    } else {
      toUpdate.push({ id: w.id, target });
      existing.add(key);
    }
  }

  console.log(`Total watched rows:        ${all.length}`);
  console.log(`Bare-numeric rows:         ${bare.length}`);
  console.log(`  -> will rename:          ${toUpdate.length}`);
  console.log(`  -> will delete (dupes):  ${toDelete.length}`);

  if (!apply) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to commit.');
    return;
  }

  for (const d of toDelete) {
    await prisma.watchedItem.delete({ where: { id: d.id } });
  }
  for (const u of toUpdate) {
    await prisma.watchedItem.update({ where: { id: u.id }, data: { tmdbId: u.target } });
  }
  console.log(`\nApplied: renamed ${toUpdate.length}, deleted ${toDelete.length}.`);
}

main()
  .catch(e => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
