// One-off backfill for the shared FilmMeta table.
//
// New titles fill themselves in as they're looked up, but everything already in
// people's libraries predates the table. This walks every distinct tmdbId users
// actually own and fetches the ones still missing.
//
// Safe to re-run: it only fetches ids that aren't stored yet.
//
//   npx tsx scripts/backfill-film-meta.ts
import 'dotenv/config';
import { config } from 'dotenv';
config({ path: '.env.local' }); // TMDB_API_KEY lives here, not in .env
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { fetchOneMeta } from '../src/app/api/meta/_fetch';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const CONCURRENCY = 8;   // gentle on TMDB's rate limit
const isEpisode = (id: string) => /^tmdb-tv-\d{1,10}-S\d{1,3}E\d{1,4}$/.test(id);

async function main() {
  const key = process.env.TMDB_API_KEY;
  if (!key) throw new Error('TMDB_API_KEY is not set');

  const [watched, ratings, watchlist, favorites, listItems, stored] = await Promise.all([
    prisma.watchedItem.findMany({ select: { tmdbId: true }, distinct: ['tmdbId'] }),
    prisma.rating.findMany({ select: { tmdbId: true }, distinct: ['tmdbId'] }),
    prisma.watchlistItem.findMany({ select: { tmdbId: true }, distinct: ['tmdbId'] }),
    prisma.favorite.findMany({ select: { tmdbId: true }, distinct: ['tmdbId'] }),
    prisma.customListItem.findMany({ select: { tmdbId: true }, distinct: ['tmdbId'] }),
    prisma.filmMeta.findMany({ select: { tmdbId: true } }),
  ]);

  const have = new Set(stored.map(r => r.tmdbId));
  const wanted = new Set<string>();
  for (const row of [...watched, ...ratings, ...watchlist, ...favorites, ...listItems]) {
    if (!isEpisode(row.tmdbId) && !have.has(row.tmdbId)) wanted.add(row.tmdbId);
  }

  const ids = [...wanted];
  console.log(`${have.size} already stored · ${ids.length} to fetch`);
  if (ids.length === 0) return;

  let done = 0, failed = 0;
  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const batch = ids.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async id => {
      try {
        const m = await fetchOneMeta(id, key);
        await prisma.filmMeta.upsert({
          where: { tmdbId: id },
          create: {
            tmdbId: id,
            mediaType: m.type === 'show' ? 'SHOW' : 'MOVIE',
            title: m.title,
            year: m.year && m.year !== '—' ? m.year : null,
            releaseDate: m.releaseDate || null,
            language: m.language ?? null,
            genres: m.genre ? m.genre.split(',').map(g => g.trim()).filter(Boolean) : [],
            runtime: typeof m.runtime === 'number' && m.runtime > 0 ? m.runtime : null,
            director: m.director ?? null,
            topCast: m.topCast ?? [],
            voteAverage: typeof m.tmdbRating === 'number' ? m.tmdbRating : null,
          },
          update: {},
        });
        done++;
      } catch {
        failed++;
      }
    }));
    if ((i + CONCURRENCY) % 80 < CONCURRENCY) console.log(`  ${done + failed}/${ids.length}…`);
  }

  console.log(`Backfilled ${done}, failed ${failed}. Table now holds ${await prisma.filmMeta.count()} titles.`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
