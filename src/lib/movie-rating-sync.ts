import { prisma } from './db';
import { MediaType } from '@/generated/prisma/client';

// Recompute the Cinephilers aggregate (MovieRating count+sum) for the given
// titles from the Rating table — the source of truth. Sets exact values and
// removes rows with no remaining ratings, so it also self-heals any prior
// drift on the touched titles. Use this wherever votes change in BULK (import,
// account deletion); the single-vote paths in /api/ratings keep their atomic
// increments, which are cheaper and safe under concurrency.

// Titles per statement. Each chunk is ONE round trip: the grouping, the upserts
// and the deletes all happen inside Postgres.
//
// It used to be one groupBy plus a $transaction of an upsert per title, 50 at a
// time — about 10,600 round trips for a 10,000-title import. Production runs its
// functions in Washington against a database in Frankfurt, so every one of those
// crossed the Atlantic, and a library of a few thousand titles ran past the
// 5-minute function limit: the person was told the import failed after their
// whole library had saved. Measured on the test database, 2026-09-12: a
// 10,000-title import took 5 min 4 s, and roughly half its aggregates were never
// written. Before that, the same shape surfaced as a transaction-deadline 500.
const CHUNK = 1000;

export interface RecomputeResult {
  /** Titles whose aggregate was recomputed. */
  recomputed: number;
  /** Titles whose aggregate could not be written; their MovieRating row is stale. */
  failed: number;
}

/** One statement: exact count+sum for every title given, rows with no ratings left removed. */
async function recomputeChunk(titles: { tmdbId: string; mediaType: MediaType }[]): Promise<void> {
  const ids = titles.map(t => t.tmdbId);
  const types = titles.map(t => t.mediaType);
  await prisma.$executeRaw`
    WITH input AS (
      SELECT DISTINCT t."tmdbId", t."mediaType"::"MediaType" AS "mediaType"
      FROM unnest(${ids}::text[], ${types}::text[]) AS t("tmdbId", "mediaType")
    ),
    agg AS (
      SELECT r."tmdbId", r."mediaType", COUNT(*)::int AS "count", COALESCE(SUM(r."score"), 0)::int AS "sum"
      FROM "Rating" r
      JOIN input i ON i."tmdbId" = r."tmdbId" AND i."mediaType" = r."mediaType"
      GROUP BY r."tmdbId", r."mediaType"
    ),
    upserted AS (
      INSERT INTO "MovieRating" ("tmdbId", "mediaType", "count", "sum", "updatedAt")
      SELECT "tmdbId", "mediaType", "count", "sum", NOW() FROM agg
      ON CONFLICT ("tmdbId", "mediaType")
      DO UPDATE SET "count" = EXCLUDED."count", "sum" = EXCLUDED."sum", "updatedAt" = NOW()
      RETURNING 1
    )
    DELETE FROM "MovieRating" m
    USING input i
    WHERE m."tmdbId" = i."tmdbId" AND m."mediaType" = i."mediaType"
      AND NOT EXISTS (SELECT 1 FROM agg a WHERE a."tmdbId" = i."tmdbId" AND a."mediaType" = i."mediaType")
  `;
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
    try {
      await recomputeChunk(chunk);
      recomputed += chunk.length;
    } catch {
      // Every title in the chunk is independently correct — each is computed from
      // the Rating table rather than from the others — so applying them one at a
      // time is not a weaker result, only a slower one, and a title that still
      // fails is left stale rather than taking the rest down with it.
      for (const title of chunk) {
        try {
          await recomputeChunk([title]);
          recomputed++;
        } catch {
          failed++;
        }
      }
    }
  }

  return { recomputed, failed };
}
