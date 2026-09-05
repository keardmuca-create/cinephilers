import { prisma } from './db';
import { MediaType } from '@/generated/prisma/client';

// Recompute the Cinephilers aggregate (MovieRating count+sum) for the given
// titles from the Rating table — the source of truth. Sets exact values and
// removes rows with no remaining ratings, so it also self-heals any prior
// drift on the touched titles. Use this wherever votes change in BULK (import,
// account deletion); the single-vote paths in /api/ratings keep their atomic
// increments, which are cheaper and safe under concurrency.

// Small enough that a chunk's batch transaction finishes well inside the
// transaction deadline. It used to be 200, and a first-time Letterboxd import
// of a few thousand rated films pushed a chunk past that deadline: the
// transaction was already closed by the time Prisma tried to roll it back, and
// the resulting error escaped as a 500 — after every row had been written.
const CHUNK = 50;

export interface RecomputeResult {
  /** Titles whose aggregate was recomputed. */
  recomputed: number;
  /** Titles whose aggregate could not be written; their MovieRating row is stale. */
  failed: number;
}

export async function recomputeMovieRatings(
  titles: { tmdbId: string; mediaType: MediaType }[],
): Promise<RecomputeResult> {
  if (titles.length === 0) return { recomputed: 0, failed: 0 };

  const seen = new Set<string>();
  const unique = titles.filter(t => {
    const k = `${t.tmdbId}:${t.mediaType}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  let recomputed = 0;
  let failed = 0;

  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const groups = await prisma.rating.groupBy({
      by: ['tmdbId', 'mediaType'],
      where: { tmdbId: { in: [...new Set(chunk.map(t => t.tmdbId))] } },
      _count: { _all: true },
      _sum: { score: true },
    });
    const byKey = new Map(groups.map(g => [`${g.tmdbId}:${g.mediaType}`, g]));

    // A factory, not an array: a PrismaPromise handed to a failed $transaction
    // cannot be awaited again, so the fallback below needs fresh operations.
    const buildOps = () => chunk.map(t => {
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
    });

    try {
      await prisma.$transaction(buildOps());
      recomputed += chunk.length;
    } catch {
      // The chunk is one transaction, so a deadline overrun loses all of it.
      // Every row in here is independently correct — each is computed from the
      // Rating table rather than from the others — so applying them one at a
      // time is not a weaker result, only a slower one, and a title that still
      // fails is left stale rather than taking the rest down with it.
      for (const op of buildOps()) {
        try {
          await op;
          recomputed++;
        } catch {
          failed++;
        }
      }
    }
  }

  return { recomputed, failed };
}
