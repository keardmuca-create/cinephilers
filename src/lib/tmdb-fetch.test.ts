import { describe, it, expect, vi, afterEach } from 'vitest';
import { tmdbRequest } from './tmdb-fetch';

const URL_ = 'https://api.themoviedb.org/3/movie/27205';

function res(status: number, headers: Record<string, string> = {}) {
  return new Response(status === 204 ? null : '{}', { status, headers });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('tmdbRequest', () => {
  it('returns a successful response without retrying', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(200));
    vi.stubGlobal('fetch', fetchMock);

    const r = await tmdbRequest(URL_);

    expect(r.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries once on 429 and returns the second response', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(res(429, { 'retry-after': '1' }))
      .mockResolvedValueOnce(res(200));
    vi.stubGlobal('fetch', fetchMock);

    const r = await tmdbRequest(URL_);

    expect(r.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries on 500-class failures', async () => {
    for (const status of [500, 502, 503, 504]) {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(res(status))
        .mockResolvedValueOnce(res(200));
      vi.stubGlobal('fetch', fetchMock);

      const r = await tmdbRequest(URL_);

      expect(r.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    }
  });

  it('does NOT retry a 404 — the answer will not change', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(404));
    vi.stubGlobal('fetch', fetchMock);

    const r = await tmdbRequest(URL_);

    expect(r.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry a 401 — a bad key stays bad', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(401));
    vi.stubGlobal('fetch', fetchMock);

    await tmdbRequest(URL_);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives up after ONE retry rather than looping', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(429));
    vi.stubGlobal('fetch', fetchMock);

    const r = await tmdbRequest(URL_);

    expect(r.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry a timeout — that would spend a second full deadline', async () => {
    const timeout = Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' });
    const fetchMock = vi.fn().mockRejectedValue(timeout);
    vi.stubGlobal('fetch', fetchMock);

    await expect(tmdbRequest(URL_)).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('attaches an abort signal to every attempt', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(200));
    vi.stubGlobal('fetch', fetchMock);

    await tmdbRequest(URL_, { next: { revalidate: 3600 } } as RequestInit);

    const init = fetchMock.mock.calls[0][1];
    expect(init.signal).toBeInstanceOf(AbortSignal);
    // The caller's own options must survive — losing `next.revalidate` here
    // would silently disable Next's fetch cache and multiply TMDB traffic.
    expect((init as { next?: { revalidate?: number } }).next?.revalidate).toBe(3600);
  });

  it('caps the wait even when TMDB asks for a long Retry-After', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(res(429, { 'retry-after': '600' }))
      .mockResolvedValueOnce(res(200));
    vi.stubGlobal('fetch', fetchMock);

    const started = Date.now();
    await tmdbRequest(URL_);
    const waited = Date.now() - started;

    // 600s honoured literally would hang the request; the cap keeps it near 1s.
    expect(waited).toBeLessThan(2_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
