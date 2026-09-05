import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// A first-time Letterboxd import of a few thousand rated films pushed one chunk of
// the aggregate recompute past the transaction deadline. Prisma then failed to roll
// back an already-closed transaction, and that error escaped as a 500 — after every
// row of the import had been committed. The user was told their import failed when
// their whole library had in fact landed.
//
// Two properties keep that from happening again, and both are easy to undo by
// accident, so they are asserted here.

const root = join(__dirname, '..', '..');
const sync = readFileSync(join(root, 'src', 'lib', 'movie-rating-sync.ts'), 'utf8');
const importRoute = readFileSync(join(root, 'src', 'app', 'api', 'import', 'route.ts'), 'utf8');

describe('the aggregate recompute survives a transaction deadline', () => {
  it('uses a chunk small enough to finish inside one', () => {
    const chunk = Number(sync.match(/const CHUNK = (\d+)/)?.[1]);
    expect(chunk).toBeGreaterThan(0);
    expect(chunk).toBeLessThanOrEqual(100);
  });

  it('falls back to applying a failed chunk one row at a time', () => {
    // Each row is computed from the Rating table rather than from the others, so
    // one at a time is not a weaker result — just a slower one.
    expect(sync).toContain('catch {');
    expect(sync).toContain('for (const op of buildOps())');
  });

  it('builds operations through a factory, not a reused array', () => {
    // A PrismaPromise handed to a failed $transaction cannot be awaited again.
    expect(sync).toContain('const buildOps = () =>');
    expect(sync).toContain('$transaction(buildOps())');
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
