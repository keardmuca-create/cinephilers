import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Ratings imported before this was fixed carry updatedAt = the moment of the import,
// because Prisma stamps @updatedAt on write and ignores any value passed on create.
// createdAt was backdated correctly; updatedAt was not. Since /api/feed orders the
// social feed by updatedAt, and the profile's Recent Activity prefers it over
// createdAt, an imported library reads as watched "just now" — every film, one
// timestamp. /api/import now repairs its own rows; this repairs the ones already in.
//
// Finding them without a marker column means recognising the SHAPE of an import: many
// backdated ratings for one user all stamped within the same second. A person
// re-scoring a film does one row at a time, so a batch of BATCH_MIN or more in a
// single second is an import and nothing else.
//
// Dry run by default. Pass --apply to actually write changes.

const apply = process.argv.includes('--apply');
const BATCH_MIN = 20;

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

interface BatchRow { userId: string; username: string | null; sec: Date; rows: bigint }

async function main() {
  const host = new URL(process.env.DATABASE_URL ?? 'postgres://unset/').host;
  console.log(`\n  Database: ${host}`);
  console.log(`  Mode: ${apply ? 'APPLY — this writes' : 'dry run (pass --apply to write)'}\n`);

  const batches = await prisma.$queryRaw<BatchRow[]>`
    SELECT r."userId", u."username", date_trunc('second', r."updatedAt") AS sec, count(*) AS rows
    FROM "Rating" r
    LEFT JOIN "User" u ON u."id" = r."userId"
    WHERE r."createdAt" < r."updatedAt"
    GROUP BY r."userId", u."username", date_trunc('second', r."updatedAt")
    HAVING count(*) >= ${BATCH_MIN}
    ORDER BY count(*) DESC
  `;

  if (batches.length === 0) {
    console.log('  Nothing to repair — no import-shaped batches found.\n');
    return;
  }

  let total = 0;
  for (const b of batches) {
    const rows = Number(b.rows);
    total += rows;
    console.log(`  ${String(rows).padStart(6)} ratings  ${b.sec.toISOString()}  @${b.username ?? b.userId}`);
  }
  console.log(`\n  ${total} ratings across ${batches.length} import batch(es).`);

  if (!apply) {
    console.log('  Nothing written. Re-run with --apply to repair.\n');
    return;
  }

  const updated = await prisma.$executeRaw`
    WITH batches AS (
      SELECT "userId", date_trunc('second', "updatedAt") AS sec
      FROM "Rating"
      WHERE "createdAt" < "updatedAt"
      GROUP BY "userId", date_trunc('second', "updatedAt")
      HAVING count(*) >= ${BATCH_MIN}
    )
    UPDATE "Rating" r
    SET "updatedAt" = r."createdAt"
    FROM batches b
    WHERE r."userId" = b."userId"
      AND date_trunc('second', r."updatedAt") = b.sec
      AND r."createdAt" < r."updatedAt"
  `;

  console.log(`\n  Repaired ${updated} ratings — their activity now reads the real watch dates.\n`);
}

main()
  .catch(e => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
