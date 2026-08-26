import { describe, it, expect, beforeEach } from 'vitest';
import { rateLimit, clearRateLimit, getIp, limiterHealth } from './rate-limit';

// No Redis configured under test, so these exercise the in-memory path — the
// same counting rules either way.

let n = 0;
const uniqueKey = () => `test-key-${Date.now()}-${n++}`;

describe('rateLimit', () => {
  it('allows up to the limit and refuses after it', async () => {
    const key = uniqueKey();
    for (let i = 0; i < 5; i++) {
      expect((await rateLimit(key, 5, 60_000)).allowed).toBe(true);
    }
    expect((await rateLimit(key, 5, 60_000)).allowed).toBe(false);
  });

  it('reports how long until the window resets', async () => {
    const key = uniqueKey();
    await rateLimit(key, 1, 60_000);
    const blocked = await rateLimit(key, 1, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
    expect(blocked.retryAfter).toBeLessThanOrEqual(60);
  });

  it('counts each key separately', async () => {
    const a = uniqueKey();
    const b = uniqueKey();
    await rateLimit(a, 1, 60_000);
    expect((await rateLimit(a, 1, 60_000)).allowed).toBe(false);
    // b must be untouched by a's exhaustion.
    expect((await rateLimit(b, 1, 60_000)).allowed).toBe(true);
  });
});

describe('clearRateLimit', () => {
  // The reason this exists: the login counter tracks FAILURES, but the check
  // itself increments. Without giving the slot back on success, five ordinary
  // sign-ins would lock someone out of their own account.
  it('lets a successful attempt give its slot back', async () => {
    const key = uniqueKey();
    for (let i = 0; i < 5; i++) {
      expect((await rateLimit(key, 5, 60_000)).allowed).toBe(true);
      await clearRateLimit(key, 60_000);
    }
    // Five successes in a row and the account is still answering.
    expect((await rateLimit(key, 5, 60_000)).allowed).toBe(true);
  });

  it('still locks when the attempts keep failing', async () => {
    const key = uniqueKey();
    // Five failures: nothing cleared, because nothing succeeded.
    for (let i = 0; i < 5; i++) await rateLimit(key, 5, 60_000);
    expect((await rateLimit(key, 5, 60_000)).allowed).toBe(false);
  });

  it('is harmless on a key that was never counted', async () => {
    await expect(clearRateLimit(uniqueKey(), 60_000)).resolves.toBeUndefined();
  });
});

describe('getIp', () => {
  it('prefers x-real-ip, which the platform sets and a client cannot append to', () => {
    const req = new Request('https://example.test', {
      headers: { 'x-real-ip': '203.0.113.5', 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
    });
    expect(getIp(req)).toBe('203.0.113.5');
  });

  it('falls back to the first entry of x-forwarded-for', () => {
    const req = new Request('https://example.test', {
      headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
    });
    expect(getIp(req)).toBe('1.2.3.4');
  });

  it('returns a constant when neither header is present', () => {
    expect(getIp(new Request('https://example.test'))).toBe('unknown');
  });
});

// The test environment has no Upstash credentials, which is exactly the state
// this asserts: with none configured the limiter is running on the in-memory Map
// — fine locally, and on serverless the same as no limiting at all, because the
// map dies with the instance. `configured: false` in production is the alarm.
describe('limiterHealth', () => {
  it('reports every field false when there are no credentials', async () => {
    await expect(limiterHealth()).resolves.toEqual({
      configured: false, reachable: false, counting: false,
    });
  });
});
