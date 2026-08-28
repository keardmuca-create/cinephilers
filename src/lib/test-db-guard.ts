// Reads the connection strings for the seeded-testing database, and refuses to
// hand them over if they point at production.
//
// This exists because the ambient environment is actively dangerous here: both
// .env and .env.local point DATABASE_URL at the live database, so any script
// that "just reads DATABASE_URL" writes to production by default. Everything
// that seeds or drives test data goes through this function instead, which reads
// one named file and checks the host before returning.
//
// Lives in src/lib rather than beside the scripts so the guard itself is covered
// by the test suite. A guard nobody has seen fail is not a guard.
import fs from 'node:fs';
import path from 'node:path';

/** The live database's host. A fact in the file, not a habit to remember. */
export const PRODUCTION_HOST_FRAGMENT = 'ep-patient-water';

export interface TestDbEnv {
  DATABASE_URL: string;
  DIRECT_URL: string;
}

/** Parse KEY=value lines, ignoring comments and surrounding quotes. */
export function parseEnvFile(contents: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of contents.split(/\r?\n/)) {
    if (line.trim().startsWith('#')) continue;
    const m = /^\s*([A-Z_]+)\s*=\s*["']?(.*?)["']?\s*$/.exec(line);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

/**
 * Validate a parsed env, or throw explaining why it can't be used.
 * Separated from file reading so the rule can be tested without a filesystem.
 */
export function assertNotProduction(vars: Record<string, string>): TestDbEnv {
  for (const key of ['DATABASE_URL', 'DIRECT_URL'] as const) {
    const value = vars[key];
    if (!value || value === 'PASTE_HERE') {
      throw new Error(`${key} is missing — .env.test has not been filled in.`);
    }
    let host: string;
    try {
      host = new URL(value).host;
    } catch {
      throw new Error(`${key} is not a valid connection URL.`);
    }
    if (host.includes(PRODUCTION_HOST_FRAGMENT)) {
      throw new Error(`REFUSING TO RUN: ${key} points at the production host (${host}).`);
    }
  }
  return { DATABASE_URL: vars.DATABASE_URL, DIRECT_URL: vars.DIRECT_URL };
}

/** The test database's connection strings, or a thrown explanation. */
export function readTestEnv(file = '.env.test'): TestDbEnv {
  const full = path.resolve(process.cwd(), file);
  if (!fs.existsSync(full)) {
    throw new Error(`${file} not found. It holds the test database connection strings.`);
  }
  return assertNotProduction(parseEnvFile(fs.readFileSync(full, 'utf8')));
}
