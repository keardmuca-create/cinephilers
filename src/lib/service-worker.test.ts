import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// A service worker is the only thing this app ships that survives a deploy and an
// ordinary cache clear. These are source-level tests on purpose: the invariants
// worth protecting are not "does this function return the right value" but "did
// somebody widen what the worker caches, or make its replacement uncacheable".
// A unit test on a helper cannot see either.

const root = join(__dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(join(root, ...parts), 'utf8');

const sw = read('public', 'sw.js');
const kill = read('scripts', 'sw-kill.js');
const offline = read('public', 'offline.html');
const registrar = read('src', 'components', 'service-worker.tsx');
const nextConfig = read('next.config.ts');
const middleware = read('src', 'middleware.ts');

describe('the worker caches nothing user-specific', () => {
  it('precaches exactly the offline page and the two icons', () => {
    const precache = sw.match(/const PRECACHE = \[([\s\S]*?)\]/)?.[1] ?? '';
    expect(precache).toContain('OFFLINE_URL');
    expect(precache).toContain('/icon-192.png');
    expect(precache).toContain('/icon-512.png');
    // Anything else in this list is a new cached file and needs the same scrutiny.
    expect(precache.split(',').filter((part) => part.trim().length > 0)).toHaveLength(3);
  });

  it('serves the offline page from a file, not from a rendered route', () => {
    // A Next-rendered page embeds build-specific chunk URLs, so a cached copy
    // would break after a deploy. offline.html has no build in it at all.
    expect(sw).toContain("const OFFLINE_URL = '/offline.html'");
  });

  it('never writes a response into the cache outside install', () => {
    const afterInstall = sw.slice(sw.indexOf("addEventListener('activate'"));
    expect(afterInstall).not.toContain('cache.put');
    expect(afterInstall).not.toContain('cache.add');
  });
});

describe('the worker declines everything but page navigations', () => {
  it('returns early for non-GET and non-navigate requests', () => {
    expect(sw).toContain("if (request.method !== 'GET') return;");
    expect(sw).toContain("if (request.mode !== 'navigate') return;");
  });

  it('calls respondWith exactly once, after those guards', () => {
    // Comments talk about respondWith; only the code counts.
    const code = sw.replace(/^\s*\/\/.*$/gm, '');
    const occurrences = code.match(/respondWith/g) ?? [];
    expect(occurrences).toHaveLength(1);
    expect(code.indexOf('respondWith')).toBeGreaterThan(code.indexOf("request.mode !== 'navigate'"));
  });

  it('passes a server response straight through instead of inspecting its status', () => {
    // Falling back on a 500 would tell someone they are offline when the server
    // is what failed. Only a thrown request reaches the catch.
    expect(sw).not.toMatch(/response\.ok|status\s*[><=]/);
    expect(sw).toContain('} catch {');
  });
});

describe('the escape hatch stays usable', () => {
  it('serves sw.js with no-cache, or the replacement can never arrive', () => {
    expect(nextConfig).toMatch(/source: '\/sw\.js'[\s\S]*?'Cache-Control', value: 'no-cache/);
  });

  it('registers with updateViaCache none', () => {
    expect(registrar).toContain("updateViaCache: 'none'");
  });

  it('unregisters and clears caches when the flag is not "true"', () => {
    expect(registrar).toContain("process.env.NEXT_PUBLIC_SW_ENABLED === 'true'");
    expect(registrar).toContain('registration.unregister()');
    expect(registrar).toContain('caches.delete');
  });

  it('has a kill file that removes the worker and adds no fetch handler', () => {
    expect(kill).toContain('self.registration.unregister()');
    expect(kill).toContain('caches.delete');
    expect(kill).not.toContain("addEventListener('fetch'");
  });
});

describe('the offline page cannot fail to load', () => {
  it('requests nothing from the network', () => {
    const body = offline.replace(/xmlns="[^"]*"/g, '');
    expect(body).not.toMatch(/<script/i);
    expect(body).not.toMatch(/<link\b/i);
    expect(body).not.toMatch(/<img\b/i);
    expect(body).not.toMatch(/https?:\/\//);
  });

  it('is kept out of search results', () => {
    expect(offline).toContain('name="robots" content="noindex"');
  });
});

describe('the production CSP allows the worker', () => {
  it("declares worker-src 'self'", () => {
    // worker-src falls back to child-src then script-src, where 'strict-dynamic'
    // makes 'self' inert. Without this the worker is blocked in production only.
    expect(middleware).toContain('"worker-src \'self\'"');
  });

  it('keeps middleware off sw.js and offline.html', () => {
    const matcher = middleware.match(/source: '\/\(\(\?!(.*?)\)/)?.[1] ?? '';
    expect(matcher).toContain('sw.js');
    expect(matcher).toContain('offline.html');
  });
});
