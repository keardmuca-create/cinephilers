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
  if (!refreshed) return res;

  return fetch(input, opts);
}
