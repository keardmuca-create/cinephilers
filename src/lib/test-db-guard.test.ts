import { describe, it, expect } from 'vitest';
import { parseEnvFile, assertNotProduction, PRODUCTION_HOST_FRAGMENT } from './test-db-guard';

const TEST_URL = 'postgresql://u:p@ep-floral-math-b2rbdn9z.c-6.eu-central-1.aws.neon.tech/neondb?sslmode=require';
const PROD_URL = `postgresql://u:p@${PRODUCTION_HOST_FRAGMENT}-agtu9dh9-pooler.c-2.eu-central-1.aws.neon.tech/neondb`;

describe('parseEnvFile', () => {
  it('reads values with or without quotes', () => {
    const out = parseEnvFile('A="one"\nB=two\nC=\'three\'');
    expect(out).toEqual({ A: 'one', B: 'two', C: 'three' });
  });

  it('ignores comments, including ones containing an = sign', () => {
    const out = parseEnvFile('# paste the string after each = sign\nA=one');
    expect(out).toEqual({ A: 'one' });
  });

  it('keeps the whole value when it contains = signs of its own', () => {
    // Connection strings end in ?sslmode=require&channel_binding=require, so a
    // naive split on "=" would truncate every one of them.
    const out = parseEnvFile(`DATABASE_URL=${TEST_URL}`);
    expect(out.DATABASE_URL).toBe(TEST_URL);
  });
});

describe('assertNotProduction', () => {
  it('accepts a pair pointing at the test database', () => {
    expect(assertNotProduction({ DATABASE_URL: TEST_URL, DIRECT_URL: TEST_URL }))
      .toEqual({ DATABASE_URL: TEST_URL, DIRECT_URL: TEST_URL });
  });

  // The whole reason this module exists. Seeding production would create fake
  // users among real members, and no part of it is undone by deleting a file.
  it('refuses when DATABASE_URL is production', () => {
    expect(() => assertNotProduction({ DATABASE_URL: PROD_URL, DIRECT_URL: TEST_URL }))
      .toThrow(/REFUSING TO RUN/);
  });

  // DIRECT_URL is the one prisma.config.ts actually prefers, so a guard that
  // only checked DATABASE_URL would miss the migration path entirely.
  it('refuses when only DIRECT_URL is production', () => {
    expect(() => assertNotProduction({ DATABASE_URL: TEST_URL, DIRECT_URL: PROD_URL }))
      .toThrow(/REFUSING TO RUN/);
  });

  it('refuses a file that was never filled in', () => {
    expect(() => assertNotProduction({ DATABASE_URL: 'PASTE_HERE', DIRECT_URL: 'PASTE_HERE' }))
      .toThrow(/has not been filled in/);
  });

  it('refuses anything that is not a URL', () => {
    expect(() => assertNotProduction({ DATABASE_URL: 'not a url', DIRECT_URL: TEST_URL }))
      .toThrow(/not a valid connection URL/);
  });
});
