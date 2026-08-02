// Create (or refresh) a preview account whose badges show every state at once,
// so the medals can be looked at before anyone real sees them.
//
// It writes ONLY a User row and that user's badge snapshot. No watched items, no
// ratings — deliberately, because ratings feed the Cinephilers score aggregates
// and a fake account must never move a real title's community rating. The badge
// numbers below are written straight into the snapshot instead.
//
//   npx tsx scripts/seed-badge-preview.ts          create / refresh
//   npx tsx scripts/seed-badge-preview.ts --remove delete it again
import 'dotenv/config';
import { config } from 'dotenv';
config({ path: '.env.local' });
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { snapshotFrom } from '../src/lib/badge-defs';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const USERNAME = 'badge_preview';
const EMAIL = 'badge-preview@cinephilers.local';

// One badge in every state: gold, silver, bronze, and locked at various distances.
const COUNTS: Record<string, number> = {
  'movie-watcher': 1240,   // gold
  'movie-rater': 612,      // silver
  'show-watcher': 12,      // bronze
  'show-rater': 51,        // silver
  'episodes-watched': 1030, // gold
  'episode-rater': 74,     // locked, 74%
  'reviewer': 12,          // locked, 24%
  'world-cinema': 10,      // bronze, just over
  'founder': 1,
};

async function main() {
  if (process.argv.includes('--remove')) {
    const existing = await prisma.user.findUnique({ where: { username: USERNAME } });
    if (!existing) { console.log('nothing to remove'); return; }
    await prisma.user.delete({ where: { username: USERNAME } });
    console.log(`removed @${USERNAME}`);
    return;
  }

  const user = await prisma.user.upsert({
    where: { username: USERNAME },
    update: {},
    create: {
      username: USERNAME,
      email: EMAIL,
      // Not a sign-in-able account: no valid password hash is ever set.
      passwordHash: 'preview-account-no-login',
      displayName: 'Badge preview',
      bio: 'Test account for checking how badges look. Not a real person.',
    },
    select: { id: true, username: true },
  });

  // Dated far in the future so the snapshot never goes stale and never gets
  // recomputed. The account has no watched or rated rows on purpose — a real
  // recompute would correctly wipe it back to zeros, which is the live behaviour
  // working, and useless for looking at medals. This row is a display fixture.
  const snapshot = snapshotFrom(COUNTS);
  const pinned = { badges: snapshot.badges as unknown as object, computedAt: new Date('3000-01-01T00:00:00Z') };
  await prisma.userBadges.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...pinned },
    update: pinned,
  });

  console.log(`@${user.username} ready — open /profile/${user.username}`);
  for (const b of snapshot.badges) {
    console.log(`  ${b.id.padEnd(18)} ${String(b.count).padStart(5)}  ${b.tier ?? 'locked'}${b.next ? ` (next ${b.next})` : ''}`);
  }
}

main().finally(() => prisma.$disconnect());
