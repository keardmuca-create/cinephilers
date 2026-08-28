// Drive the running dev server as several signed-in people at once.
//
// The browser holds one cookie jar, so it can only ever be one person. Every
// other account is driven from here, with its session attached per request —
// which is what makes "A follows B, B sees it, C doesn't" testable at all.
//
// Nothing in here asserts. It reports what happened and leaves the judgement to
// the person reading, because half of what this run is looking for is not
// "did it error" but "is that a sensible answer".
import { mintSession } from '../test-session';

export const BASE = process.env.E2E_BASE ?? 'http://localhost:9003';

export interface Session { id: string; username: string; cookie: string }

const cache = new Map<string, Session>();

export async function session(username: string): Promise<Session> {
  const hit = cache.get(username);
  if (hit) return hit;
  const s = await mintSession(username);
  cache.set(username, s);
  return s;
}

export interface Result {
  status: number;
  ok: boolean;
  data: unknown;
  message?: string;
  ms: number;
}

/** One request as one person. `who` of null means signed out. */
export async function api(
  who: string | null,
  method: string,
  path: string,
  body?: unknown,
): Promise<Result> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (who) headers['Cookie'] = (await session(who)).cookie;

  const started = Date.now();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const ms = Date.now() - started;

  const text = await res.text();
  let json: { success?: boolean; data?: unknown; message?: string } | null = null;
  try { json = JSON.parse(text); } catch { /* an HTML error page, not JSON */ }

  return {
    status: res.status,
    ok: res.ok,
    data: json?.data ?? null,
    // A non-JSON body means a page was returned where an endpoint was expected —
    // usually a 404 route. Say so rather than reporting a silent null.
    message: json?.message ?? (json ? undefined : `non-JSON response (${text.slice(0, 60)}…)`),
    ms,
  };
}

/** Print one line per step, so a run reads as a transcript. */
export function log(label: string, r: Result, extra?: string): void {
  const mark = r.ok ? 'ok  ' : 'FAIL';
  const detail = r.ok ? (extra ?? '') : `${r.message ?? ''}`;
  console.log(`  ${mark} ${String(r.status).padEnd(3)} ${String(r.ms).padStart(5)}ms  ${label}${detail ? ' — ' + detail : ''}`);
}

export function section(name: string): void {
  console.log(`\n── ${name} ${'─'.repeat(Math.max(0, 60 - name.length))}`);
}

/** Films used throughout, so results are comparable between scenarios. */
export const FILMS = {
  godfather:  { tmdbId: 'tmdb-238',    title: 'The Godfather' },
  parasite:   { tmdbId: 'tmdb-496243', title: 'Parasite' },
  seven:      { tmdbId: 'tmdb-807',    title: 'Se7en' },
  amelie:     { tmdbId: 'tmdb-194',    title: 'Amélie' },
  spirited:   { tmdbId: 'tmdb-129',    title: 'Spirited Away' },
};

export const SHOWS = {
  breakingBad: { tmdbId: 'tmdb-tv-1396', title: 'Breaking Bad' },
  chernobyl:   { tmdbId: 'tmdb-tv-87108', title: 'Chernobyl' },
};
