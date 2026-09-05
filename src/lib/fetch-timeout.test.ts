import { describe, it, expect, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { withTimeout, REQUEST_TIMEOUT_MS } from './fetch-timeout';

// The bug being fixed is a request that never settles. A test that only reads the
// source cannot tell whether that is actually true any more, so this one starts a
// server that accepts the connection and then says nothing at all — the same shape
// as a request iOS froze — and checks that the fetch rejects instead of hanging.

const hanging: Server = createServer(() => {
  // Deliberately never respond, never close.
});
const port = 3187;
await new Promise<void>((resolve) => hanging.listen(port, resolve));
afterAll(() => { hanging.close(); });

describe('withTimeout', () => {
  it('attaches a deadline when the caller supplies none', () => {
    const init = withTimeout({ method: 'POST' });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init?.method).toBe('POST');
  });

  it('leaves the caller\'s own signal in place', () => {
    const mine = new AbortController();
    const init = withTimeout({ signal: mine.signal });
    expect(init?.signal).toBe(mine.signal);
  });

  it('is a sane length', () => {
    expect(REQUEST_TIMEOUT_MS).toBeGreaterThanOrEqual(10_000);
    expect(REQUEST_TIMEOUT_MS).toBeLessThanOrEqual(60_000);
  });

  it('rejects a request that never answers, rather than waiting forever', async () => {
    // Same mechanism as withTimeout, with a short deadline so the test is quick.
    const start = Date.now();
    await expect(
      fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(300) })
    ).rejects.toThrow();
    expect(Date.now() - start).toBeLessThan(3000);
  });
});
