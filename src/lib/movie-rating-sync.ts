import { prisma } from './db';
import { MediaType } from '@/generated/prisma/client';

// Recompute the Cinephilers aggregate (MovieRating count+sum) for the given
// titles from the Rating table — the source of truth. Sets exact values and
// removes rows with no remaining ratings, so it also self-heals any prior
// drift on the touched titles. Use this wherever votes change in BULK (import,
// account deletion); the single-vote paths in /api/ratings keep their atomic
// increments, which are cheaper and safe under concurrency.
export async function recomputeMovieRatings(
  titles: { tmdbId: string; mediaType: MediaType }[],
): Promise<void> {
  if (titles.length === 0) return;

  const seen = new Set<string>();
  const unique = titles.filter(t => {
    const k = `${t.tmdbId}:${t.mediaType}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const CHUNK = 200;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const groups = await prisma.rating.groupBy({
      by: ['tmdbId', 'mediaType'],
      where: { tmdbId: { in: [...new Set(chunk.map(t => t.tmdbId))] } },
      _count: { _all: true },
      _sum: { score: true },
    });
    const byKey = new Map(groups.map(g => [`${g.tmdbId}:${g.mediaType}`, g]));

    await prisma.$transaction(chunk.map(t => {
      const g = byKey.get(`${t.tmdbId}:${t.mediaType}`);
      const count = g?._count._all ?? 0;
      const sum = g?._sum.score ?? 0;
      if (count === 0) {
        return prisma.movieRating.deleteMany({
          where: { tmdbId: t.tmdbId, mediaType: t.mediaType },
        });
      }
      return prisma.movieRating.upsert({
        where: { tmdbId_mediaType: { tmdbId: t.tmdbId, mediaType: t.mediaType } },
        create: { tmdbId: t.tmdbId, mediaType: t.mediaType, count, sum },
        update: { count, sum },
      });
    }));
  }
}
