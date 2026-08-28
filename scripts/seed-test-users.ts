// Create fake users for multi-user testing.
//
// The flows that matter most — follows, follow requests, notifications, one
// person's activity in another's feed, the 5-vote flip from TMDB to the
// community score — cannot be tested by one person with one account. This makes
// the other people.
//
// SAFETY. This script writes users, and there is exactly one database it must
// never write them to. It therefore ignores DATABASE_URL entirely: .env and
// .env.local both point at PRODUCTION, so reading the ambient environment is how
// an accident happens. It reads .env.test and nothing else, and refuses to run if
// that file names a host on the production project.
//
//   npx tsx scripts/seed-test-users.ts
//
import bcrypt from 'bcryptjs';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { readTestEnv } from '../src/lib/test-db-guard';

// Obviously fake, and obviously fake at a glance in a database browser too. The
// .local suffix is reserved by RFC 6762 and can never be a real address, so
// nothing here can ever collide with a member's email.
export const TEST_USERS = [
  // alpha is the one the browser drives. Everyone else is driven through the API.
  { username: 'test_alpha',   displayName: 'Alpha Tester',   email: 'alpha@test.local',   isPrivate: false },
  { username: 'test_beta',    displayName: 'Beta Tester',    email: 'beta@test.local',    isPrivate: false },
  { username: 'test_gamma',   displayName: 'Gamma Tester',   email: 'gamma@test.local',   isPrivate: false },
  // Private on purpose: follow REQUESTS only exist against a private account, and
  // so does the 403 on someone else's badges, languages and lists.
  { username: 'test_delta',   displayName: 'Delta Tester',   email: 'delta@test.local',   isPrivate: true  },
  // The Cinephilers score replaces TMDB's at five votes, so five people have to be
  // able to rate the same film. Three accounts could never reach it.
  { username: 'test_epsilon', displayName: 'Epsilon Tester', email: 'epsilon@test.local', isPrivate: false },
  { username: 'test_zeta',    displayName: 'Zeta Tester',    email: 'zeta@test.local',    isPrivate: false },
  { username: 'test_eta',     displayName: 'Eta Tester',     email: 'eta@test.local',     isPrivate: false },
  // Deliberately left empty for the whole run — every list, stat and badge has an
  // empty state, and empty states are where a division by zero lives.
  { username: 'test_theta',   displayName: 'Theta Tester',   email: 'theta@test.local',   isPrivate: false },
];

// One password for all of them, so Keard can also sign in by hand and drive a
// second account through a real browser session if he wants to.
export const TEST_PASSWORD = 'TestPass123!';

async function main() {
  const env = readTestEnv();
  const host = new URL(env.DIRECT_URL).host;
  console.log(`Seeding ${host}\n`);

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DIRECT_URL }) });

  try {
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 12);

    for (const u of TEST_USERS) {
      // isVerified true because login refuses unverified accounts created after
      // the cutoff, and no mail is ever sent to a .local address to click.
      //
      // createdAt is left at now() on purpose: it puts these accounts after the
      // Founder-welcome cutoff, so the welcome screen is testable too.
      const user = await prisma.user.upsert({
        where: { username: u.username },
        update: {},
        create: {
          email: u.email,
          username: u.username,
          displayName: u.displayName,
          passwordHash,
          isVerified: true,
          isPrivate: u.isPrivate,
          timezone: 'Europe/Tirane',
        },
        select: { id: true, username: true },
      });
      console.log(`  ${user.username}  ${user.id}`);
    }

    const total = await prisma.user.count();
    console.log(`\n${total} users in the database.`);
    console.log(`Password for all of them: ${TEST_PASSWORD}`);
  } finally {
    await prisma.$disconnect();
  }
}

// Only when run directly, so the helpers above can be imported by a test.
if (process.argv[1] && process.argv[1].endsWith('seed-test-users.ts')) {
  main().catch(e => { console.error('\n' + e.message); process.exit(1); });
}
