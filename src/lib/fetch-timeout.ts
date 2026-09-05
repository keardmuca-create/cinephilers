// A request that never settles is worse than one that fails.
//
// iOS freezes a PWA when it goes to the background. Requests that were in flight
// die there without rejecting, so the promise waiting on them is never resolved
// and never rejected. Anything downstream waits forever: a section keeps its
// spinner, and in auth-context the `finally` that clears `loading` never runs, so
// the whole app sits half-loaded until the tab is closed and reopened.
//
// A deadline turns that silence into an error, which the existing catch blocks
// already handle — they fall back to the localStorage copy and let the app render.

// Long enough that no real request on a bad mobile connection ever reaches it, and
// short enough that a frozen one does not hold a screen hostage.
export const REQUEST_TIMEOUT_MS = 20_000;

// Some older iOS versions have no AbortSignal.timeout. There, requests behave
// exactly as they did before rather than throwing on a missing API.
const HAS_TIMEOUT_SIGNAL =
  typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function';

/**
 * Adds a deadline to fetch options, unless the caller already passes its own
 * signal — a caller that aborts deliberately (a search-as-you-type hook, say)
 * owns that request's lifetime and must not have a second signal imposed on it.
 */
export function withTimeout(init?: RequestInit): RequestInit | undefined {
  if (!HAS_TIMEOUT_SIGNAL) return init;
  if (init?.signal) return init;
  return { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) };
}
