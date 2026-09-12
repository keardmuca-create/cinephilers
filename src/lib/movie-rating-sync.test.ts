import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Big imports broke twice in the same place: the aggregate recompute that runs after
// every row has been committed. First a transaction deadline turned it into a 500
// (2026-09-05); then, measured 2026-09-12, its ~10,600 round trips for a
// 10,000-title library ran past the 5-minute function limit. Either way the person
// was told the import failed when their whole library had in fact landed.
//
// The properties that keep that from happening again are easy to undo by
// accident, so they are asserted here.

const root = join(__dirname, '..', '..');
const sync = readFileSync(join(root, 'src', 'lib', 'movie-rating-sync.ts'), 'utf8');
const importRoute = readFileSync(join(root, 'src', 'app', 'api', 'import', 'route.ts'), 'utf8');

describe('the aggregate recompute stays fast on a big library', () => {
  it('does a whole chunk in one statement, not one query per title', () => {
    expect(sync).toContain('prisma.$executeRaw`');
    expect(sync).toContain('ON CONFLICT ("tmdbId", "mediaType")');
    expect(sync).not.toContain('$transaction(');
    expect(sync).not.toContain('movieRating.upsert(');
  });

  it('uses chunks big enough to keep round trips few', () => {
    const chunk = Number(sync.match(/const CHUNK = (\d+)/)?.[1]);
    expect(chunk).toBeGreaterThanOrEqual(500);
  });

  it('removes the aggregate of a title with no ratings left', () => {
    expect(sync).toContain('DELETE FROM "MovieRating"');
    expect(sync).toContain('NOT EXISTS');
  });

  it('falls back to one title at a time when a chunk fails', () => {
    expect(sync).toContain('catch {');
    expect(sync).toContain('await recomputeChunk([title])');
  });

  it('reports how many titles were left stale instead of throwing', () => {
    expect(sync).toMatch(/return \{ recomputed, failed \}/);
  });
});

describe('a committed import is never reported as a failure', () => {
  it('wraps the recompute so it cannot fail the request', () => {
    const after = importRoute.slice(importRoute.indexOf('Imported votes must count'));
    const tryAt = after.indexOf('try {');
    const callAt = after.indexOf('recomputeMovieRatings(');
    expect(tryAt).toBeGreaterThanOrEqual(0);
    expect(tryAt).toBeLessThan(callAt);
    expect(after).toContain('Sentry.captureException(e)');
  });

  it('still surfaces a stale aggregate rather than hiding it', () => {
    expect(importRoute).toContain('Sentry.captureMessage');
  });
});
