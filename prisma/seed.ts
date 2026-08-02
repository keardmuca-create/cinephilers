import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database…');

  const passwordHash = await bcrypt.hash('Password123!', 12);

  const demo = await prisma.user.upsert({
    where: { email: 'demo@cinephilers.app' },
    update: {},
    create: {
      email: 'demo@cinephilers.app',
      username: 'demo',
      passwordHash,
      displayName: 'Demo User',
      isVerified: true,
      bio: 'Cinephile. Fan of neo-noir, slow cinema, and anything Tarkovsky.',
      favoriteGenres: ['Drama', 'Thriller', 'Sci-Fi'],
      ratingsCount: 3,
    },
  });

  // No badge is seeded: badges are computed from the library on demand, so the
  // demo user's fall out of the ratings and watched rows below.

  // Sample ratings
  const ratings = [
    { tmdbId: '550', mediaType: 'MOVIE' as const, score: 10 },
    { tmdbId: '680', mediaType: 'MOVIE' as const, score: 9 },
    { tmdbId: '238', mediaType: 'MOVIE' as const, score: 10 },
  ];

  for (const r of ratings) {
    await prisma.rating.upsert({
      where: { userId_tmdbId_mediaType: { userId: demo.id, tmdbId: r.tmdbId, mediaType: r.mediaType } },
      update: {},
      create: { userId: demo.id, ...r },
    });
  }

  // Sample review
  await prisma.review.upsert({
    where: { userId_tmdbId_mediaType: { userId: demo.id, tmdbId: '550', mediaType: 'MOVIE' } },
    update: {},
    create: {
      userId: demo.id,
      tmdbId: '550',
      mediaType: 'MOVIE',
      body: 'A masterpiece of modern cinema. Every frame is deliberate and meaningful.',
      containsSpoiler: false,
    },
  });

  // Sample watchlist
  await prisma.watchlistItem.upsert({
    where: { userId_tmdbId_mediaType: { userId: demo.id, tmdbId: '278', mediaType: 'MOVIE' } },
    update: {},
    create: { userId: demo.id, tmdbId: '278', mediaType: 'MOVIE' },
  });

  // Sample watched
  await prisma.watchedItem.upsert({
    where: { userId_tmdbId_mediaType: { userId: demo.id, tmdbId: '550', mediaType: 'MOVIE' } },
    update: {},
    create: { userId: demo.id, tmdbId: '550', mediaType: 'MOVIE' },
  });

  // Sample favorite
  await prisma.favorite.upsert({
    where: { userId_tmdbId_mediaType: { userId: demo.id, tmdbId: '550', mediaType: 'MOVIE' } },
    update: {},
    create: { userId: demo.id, tmdbId: '550', mediaType: 'MOVIE' },
  });

  // Sample list
  const list = await prisma.customList.upsert({
    where: { id: 'seed-list-1' },
    update: {},
    create: { id: 'seed-list-1', userId: demo.id, name: 'All-Time Favourites', isPublic: true, itemsCount: 2 },
  });

  await prisma.customListItem.upsert({
    where: { listId_tmdbId_mediaType: { listId: list.id, tmdbId: '550', mediaType: 'MOVIE' } },
    update: {},
    create: { listId: list.id, tmdbId: '550', mediaType: 'MOVIE' },
  });

  console.log('Seed complete. Demo login: demo@cinephilers.app / Password123!');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
