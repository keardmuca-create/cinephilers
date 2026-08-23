// One place where every outbound TMDB request gets a deadline and a retry.
//
// Before this, a TMDB call had neither. There was no request timeout at all, so
// a slow or unreachable TMDB held a serverless function open until the platform
// killed it — billed time spent waiting on someone else's outage. And any
// non-OK status threw immediately, which meant TMDB's own rate-limit response
// (429) was treated as a crash rather than as "ask again in a moment", losing
// data the retry would have got.
//
// Deliberately conservative on time. One retry, short backoff: the worst case
// has to stay inside a request a person is waiting on, so this is a ceiling on
// damage rather than a general-purpose resilience layer.

const TIMEOUT_MS = 5_000;
// Statuses where trying again is meaningful. A 404 or 401 will say the same
// thing the second time, so those fail straight through to the caller.
const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const MAX_BACKOFF_MS = 1_000;

function backoffFor(res: Response): number {
  // TMDB sends Retry-After in seconds on a 429. Honour it, but never wait
  // longer than the cap — a person is on the other end of this request.
  const header = res.headers.get('retry-after');
  const seconds = header ? Number(header) : NaN;
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.min(seconds * 1_000, MAX_BACKOFF_MS);
  }
  return MAX_BACKOFF_MS / 2;
}

/**
 * Fetch a TMDB URL with a timeout and a single retry on transient failures.
 * Resolves with the Response exactly as `fetch` would — status checking stays
 * with the caller, so existing error handling keeps working unchanged.
 */
export async function tmdbRequest(url: string, init?: RequestInit): Promise<Response> {
  // Only a retryable STATUS earns a second attempt. A timeout or a connection
  // failure does not: if TMDB is unreachable, trying again just spends another
  // full timeout finding that out, which is exactly the held-open function this
  // exists to prevent. So the ceiling is one timeout, not two.
  const first = await fetch(url, {
    ...init,
    // AbortSignal.timeout rejects the fetch once the deadline passes — the part
    // plain fetch has never done on its own.
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!RETRYABLE.has(first.status)) return first;

  await new Promise(r => setTimeout(r, backoffFor(first)));

  return fetch(url, {
    ...init,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}
