import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// The convention this file enforces:
//
// Every API route that mutates must be rate limited — either by calling
// writeLimit, or by having its own tighter limiter (login, registration and
// import all do). Middleware cannot do this for us without running on every read
// as well, so it is a per-route call, and a per-route call is exactly the kind of
// thing that gets forgotten on the next route somebody adds.
//
// So the test walks the route tree rather than naming files. A new endpoint with
// a POST and no limiter fails here, on the day it is written, instead of being
// found in an audit months later.

const API_DIR = join(process.cwd(), 'src', 'app', 'api');
const MUTATES = /export async function (POST|PUT|PATCH|DELETE)/;
const LIMITED = /writeLimit|rateLimit/;

// Exemptions are listed, never inferred — an unexplained gap is how the original
// 32 unlimited endpoints happened.
const EXEMPT = new Set([
  // Clears this browser's cookies and touches nothing else: no database, no
  // token signing, no email. Calling it repeatedly costs the server less than
  // the Redis round trip a limiter would add, and it is already idempotent.
  '/auth/logout/route.ts',
]);

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...routeFiles(full));
    else if (entry === 'route.ts') out.push(full);
  }
  return out;
}

describe('every mutating API route is rate limited', () => {
  const files = routeFiles(API_DIR);

  it('finds the route tree at all', () => {
    // Guards the guard: a moved directory would otherwise make this suite pass
    // by checking nothing.
    expect(files.length).toBeGreaterThan(50);
  });

  const unlimited = files
    .filter(f => {
      const src = readFileSync(f, 'utf8');
      return MUTATES.test(src) && !LIMITED.test(src);
    })
    .map(f => f.replace(API_DIR, '').replace(/\\/g, '/'))
    .filter(rel => !EXEMPT.has(rel));

  it('leaves no mutating route without a limiter', () => {
    expect(unlimited).toEqual([]);
  });

  it('keeps every exemption real', () => {
    // An exemption for a file that no longer exists is a stale excuse that would
    // silently cover a future route sharing the path.
    const all = files.map(f => f.replace(API_DIR, '').replace(/\\/g, '/'));
    for (const e of EXEMPT) expect(all).toContain(e);
  });
});
