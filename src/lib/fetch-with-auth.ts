async function tryRefresh(): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchWithAuth(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const opts = { ...init, credentials: 'include' as RequestCredentials };
  const res = await fetch(input, opts);
  if (res.status !== 401) return res;

  const refreshed = await tryRefresh();
  if (!refreshed) {
    // Session is dead — tell the app to log out
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('session-expired'));
    }
    return res;
  }

  return fetch(input, opts);
}
