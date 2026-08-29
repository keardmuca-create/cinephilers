import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Two things can silently break this feature, and neither shows up at runtime
// until the day someone needs the log and finds it empty.
//
// 1. The action list in src/lib/audit.ts drifting from enum AuditAction in the
//    schema. A name that exists in TypeScript but not in Postgres is accepted by
//    the compiler and rejected by the database — inside writeAudit's catch, so
//    the event is lost with only a console line to show for it.
//
// 2. An audited action gaining a second code path that forgets to log. The
//    account delete already has two (admin and self-serve); the next one will
//    not announce itself.

const SCHEMA = readFileSync(join(process.cwd(), 'prisma', 'schema.prisma'), 'utf8');
const AUDIT_LIB = readFileSync(join(process.cwd(), 'src', 'lib', 'audit.ts'), 'utf8');
const API_DIR = join(process.cwd(), 'src', 'app', 'api');

function schemaEnumValues(name: string): string[] {
  const block = SCHEMA.match(new RegExp(`enum ${name} \{([^}]*)\}`));
  if (!block) return [];
  return block[1]
    .split('\n')
    .map(l => l.replace(/\/\/.*$/, '').trim())
    .filter(Boolean);
}

function libUnionValues(): string[] {
  const block = AUDIT_LIB.match(/export type AuditAction =([\s\S]*?);/);
  if (!block) return [];
  return [...block[1].matchAll(/'([A-Z_]+)'/g)].map(m => m[1]);
}

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...routeFiles(full));
    else if (entry === 'route.ts') out.push(full);
  }
  return out;
}

describe('audit action list', () => {
  const schemaValues = schemaEnumValues('AuditAction');
  const libValues = libUnionValues();

  it('finds both lists at all', () => {
    // Guards the guard: a renamed enum would otherwise make everything below
    // pass by comparing two empty arrays.
    expect(schemaValues.length).toBeGreaterThan(0);
    expect(libValues.length).toBeGreaterThan(0);
  });

  it('is identical in the schema and in audit.ts', () => {
    expect([...libValues].sort()).toEqual([...schemaValues].sort());
  });

  it('has no action defined but never written', () => {
    const routeSource = routeFiles(API_DIR).map(f => readFileSync(f, 'utf8')).join('\n');
    const unused = schemaValues.filter(v => !routeSource.includes(`'${v}'`));
    expect(unused).toEqual([]);
  });
});

describe('every path that performs an audited action logs it', () => {
  // Both account-delete paths, named explicitly rather than inferred, because
  // "a route that calls user.delete" is exactly the pattern a third one would
  // match without anybody noticing it needs a log line too.
  const DELETE_PATHS = [
    join(API_DIR, 'admin', 'users', 'route.ts'),
    join(API_DIR, 'users', 'me', 'route.ts'),
  ];

  it('the two delete paths log distinguishable actions', () => {
    expect(readFileSync(DELETE_PATHS[0], 'utf8')).toContain("'USER_DELETED'");
    expect(readFileSync(DELETE_PATHS[1], 'utf8')).toContain("'USER_SELF_DELETED'");
  });

  // No exemptions. Every path that destroys an account logs it — the admin one
  // and the self-serve one both, which is what makes "an admin removed you" and
  // "you removed yourself" separable months later.
  it('no route deletes an account without importing writeAudit', () => {
    for (const file of routeFiles(API_DIR)) {
      const src = readFileSync(file, 'utf8');
      if (!src.includes('prisma.user.delete')) continue;
      expect(src, `${file} deletes an account without an audit import`).toContain('@/lib/audit');
    }
  });
});
