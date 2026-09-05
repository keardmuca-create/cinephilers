import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Prisma stamps @updatedAt on write and ignores a value passed on create, so an
// import's ratings all land with updatedAt = the moment of the import even though
// createdAt was backdated. /api/feed orders the social feed by updatedAt and the
// profile's Recent Activity prefers it, so without a repair an imported library
// reads as watched "just now" and floods followers' feeds — the same failure the
// backdated review dates were written to prevent, missed because a rating carries
// a second timestamp.

const root = join(__dirname, '..', '..');
const importRoute = readFileSync(join(root, 'src', 'app', 'api', 'import', 'route.ts'), 'utf8');
const schema = readFileSync(join(root, 'prisma', 'schema.prisma'), 'utf8');

describe('an imported rating keeps its real date', () => {
  it('still has an updatedAt Prisma controls, which is why the repair is needed', () => {
    // If this ever stops being @updatedAt, the raw UPDATE below can go.
    expect(schema).toMatch(/model Rating[\s\S]*?updatedAt DateTime\s+@updatedAt/);
  });

  it('rewrites updatedAt to the backdated createdAt', () => {
    expect(importRoute).toContain('UPDATE "Rating" SET "updatedAt" = "createdAt"');
  });

  it('scopes the rewrite to rows this request wrote and backdated', () => {
    // Without both bounds it would flatten a rating the user genuinely re-scored.
    const stmt = importRoute.slice(importRoute.indexOf('UPDATE "Rating"'));
    expect(stmt).toContain('"updatedAt" >= ${importStartedAt}');
    expect(stmt).toContain('"createdAt" < ${importStartedAt}');
    expect(importRoute).toContain('const importStartedAt = new Date();');
  });

  it('takes the boundary before the rows are written, not after', () => {
    expect(importRoute.indexOf('const importStartedAt')).toBeLessThan(
      importRoute.indexOf('prisma.rating.createMany'),
    );
  });

  it('cannot fail an import that has already committed', () => {
    const stmt = importRoute.slice(importRoute.indexOf('if (ratingRes.count > 0)'));
    const tryAt = stmt.indexOf('try {');
    const sqlAt = stmt.indexOf('UPDATE "Rating"');
    expect(tryAt).toBeGreaterThanOrEqual(0);
    expect(tryAt).toBeLessThan(sqlAt);
  });
});
