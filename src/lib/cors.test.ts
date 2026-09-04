import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// CORS is configured once, in next.config.ts, because middleware deliberately does
// not run on /api. These tests guard the properties that make opening the API to
// another origin safe — a wildcard or a credentials flag added later would be easy
// to write, hard to notice, and would change what a hostile page can do.

const nextConfig = readFileSync(join(__dirname, '..', '..', 'next.config.ts'), 'utf8');
const cors = nextConfig.slice(nextConfig.indexOf('const corsHeaders'), nextConfig.indexOf('const nextConfig'));

describe('CORS is scoped to the native app and nothing else', () => {
  it('allows exactly one origin, the Capacitor iOS one', () => {
    expect(cors).toContain("value: NATIVE_ORIGIN");
    expect(nextConfig).toContain("const NATIVE_ORIGIN = 'capacitor://localhost'");
  });

  it('never uses a wildcard origin', () => {
    // '*' would let any website read every response this API returns.
    expect(cors).not.toMatch(/Access-Control-Allow-Origin'[^}]*'\*'/);
  });

  it('does not allow credentials', () => {
    // Native sends bearer tokens in a header. Allowing credentials would make the
    // web's httpOnly session cookies usable from another origin, which is the one
    // thing this must never enable. Comments mention it; only the code counts.
    const code = nextConfig.replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toContain('Access-Control-Allow-Credentials');
  });

  it('allows only the headers the native client actually sends', () => {
    const allowed = cors.match(/Access-Control-Allow-Headers', value: '([^']*)'/)?.[1] ?? '';
    expect(allowed.split(',').map((h) => h.trim().toLowerCase()).sort()).toEqual([
      'authorization',
      'content-type',
      'x-client',
    ]);
  });

  it('applies to /api only, never to pages', () => {
    expect(nextConfig).toMatch(/source: '\/api\/:path\*',\s*headers: corsHeaders/);
    // The catch-all route must keep carrying the security headers, not the CORS ones.
    expect(nextConfig).toMatch(/source: '\/\(\.\*\)',\s*headers: securityHeaders/);
  });
});
