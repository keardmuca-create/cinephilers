import { withTimeout } from './fetch-timeout';

async function tryRefresh(): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/refresh', withTimeout({ method: 'POST', credentials: 'include' }));
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchWithAuth(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const opts = { ...init, credentials: 'include' as RequestCredentials };
  // Every attempt gets its own deadline: a frozen request must reject rather than
  // leave the caller waiting forever. See lib/fetch-timeout.
  const res = await fetch(input, withTimeout(opts));
  if (res.status !== 401) return res;

  const refreshed = await tryRefresh();
  if (!refreshed) {
    // Session is dead — tell the app to log out
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('session-expired'));
    }
    return res;
  }

  return fetch(input, withTimeout(opts));
}
