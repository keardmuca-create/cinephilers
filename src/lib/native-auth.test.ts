import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { isNativeRequest, getRefreshTokenFromRequest } from './auth-utils';

// A Capacitor app is cross-site to this API, so the SameSite=Lax cookies the web
// uses never reach it. Native clients send their tokens by hand instead. The rule
// these tests hold in place is that the web NEVER receives a token it could read
// from JavaScript — httpOnly cookies are the whole point of the web path, and
// handing the same tokens to the page would put a stealable copy in reach of any
// injected script.

function req(headers: Record<string, string> = {}) {
  return new NextRequest('https://cinephilers.app/api/auth/refresh', { headers });
}

describe('isNativeRequest', () => {
  it('recognises the native client header', () => {
    expect(isNativeRequest(req({ 'x-client': 'native' }))).toBe(true);
  });

  it('is case insensitive on the value', () => {
    expect(isNativeRequest(req({ 'x-client': 'Native' }))).toBe(true);
  });

  it('treats a plain browser request as web', () => {
    expect(isNativeRequest(req())).toBe(false);
  });

  it('does not accept some other client name', () => {
    expect(isNativeRequest(req({ 'x-client': 'web' }))).toBe(false);
  });
});

describe('getRefreshTokenFromRequest', () => {
  it('prefers the cookie and reports it did not come from a header', () => {
    const r = req({ cookie: 'refresh_token=from-cookie' });
    expect(getRefreshTokenFromRequest(r)).toEqual({ token: 'from-cookie', fromHeader: false });
  });

  it('falls back to the Authorization header when there is no cookie', () => {
    const r = req({ authorization: 'Bearer from-header' });
    expect(getRefreshTokenFromRequest(r)).toEqual({ token: 'from-header', fromHeader: true });
  });

  it('still reports fromHeader:false when both are present', () => {
    // The web sending a stray Authorization header must not be able to opt itself
    // into the native response shape and be handed a refresh token it can read.
    const r = req({ cookie: 'refresh_token=jar', authorization: 'Bearer header' });
    expect(getRefreshTokenFromRequest(r)).toEqual({ token: 'jar', fromHeader: false });
  });

  it('ignores an Authorization header that is not a Bearer token', () => {
    expect(getRefreshTokenFromRequest(req({ authorization: 'Basic abc' })).token).toBeNull();
  });

  it('returns null when there is nothing to read', () => {
    expect(getRefreshTokenFromRequest(req())).toEqual({ token: null, fromHeader: false });
  });
});

// The two route files carry the actual security decision. A unit test on the
// helpers cannot see whether a route stopped using them, so these read the source
// — the same approach write-limit.test.ts takes for rate limiters.
describe('the routes gate tokens on client type', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), 'src', 'app', 'api', 'auth', p), 'utf8');

  it('login returns tokens only to native clients', () => {
    const src = read(join('login', 'route.ts'));
    expect(src).toMatch(/const native = isNativeRequest\(req\)/);
    expect(src).toMatch(/\.\.\.\(native \? \{ accessToken, refreshToken \} : \{\}\)/);
  });

  it('refresh echoes a refresh token only to a caller that sent one in a header', () => {
    const src = read(join('refresh', 'route.ts'));
    expect(src).toMatch(/getRefreshTokenFromRequest\(req\)/);
    expect(src).toMatch(/\.\.\.\(fromHeader \? \{ refreshToken: newRefresh \} : \{\}\)/);
    // The cookie read it replaced must be gone, or the header path is dead code.
    expect(src).not.toMatch(/req\.cookies\.get\('refresh_token'\)/);
  });
});
