import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// One-time (and idempotent) backfill: recompute every movie's rating aggregate
// (count + sum) straight from the Rating table. Safe to re-run — it overwrites
// each aggregate with absolute values rather than incrementing.
async function main() {
  console.log('Backfilling MovieRating aggregates from existing ratings…');

  const groups = await prisma.rating.groupBy({
    by: ['tmdbId', 'mediaType'],
    _count: { _all: true },
    _sum: { score: true },
  });

  console.log(`Found ${groups.length} rated titles.`);

  for (const g of groups) {
    const count = g._count._all;
    const sum = g._sum.score ?? 0;
    await prisma.movieRating.upsert({
      where: { tmdbId_mediaType: { tmdbId: g.tmdbId, mediaType: g.mediaType } },
      create: { tmdbId: g.tmdbId, mediaType: g.mediaType, count, sum },
      update: { count, sum },
    });
  }

  console.log('Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
