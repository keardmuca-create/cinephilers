// The local watch log — one entry per title you logged in the app, with the
// genre, language and hour it happened.
//
// This is all that survives of the old client-side badge system. Badges are
// computed on the server now (see lib/badge-compute), so nothing reads the log to
// award anything; it stays because the import dialog writes it and the history
// and diary pages prune it when you delete something.

import { recordAddedAt } from '@/lib/media-id';

export interface WatchEntry {
  id: string;
  type: 'movie' | 'episode';
  genre: string;
  language: string;
  hour: number;
  loggedAt: string;
  /** Set on rows that came from a Letterboxd import rather than an in-app log. */
  source?: string;
}

function safeGetItem(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function safeParseJSON<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

export function appendWatchLog(entry: {
  id: string; type: 'movie' | 'episode'; genre: string; language: string; loggedAt?: string;
}): void {
  try {
    const now = new Date();
    const log = safeParseJSON<WatchEntry[]>(safeGetItem('watch-log'), []);
    const newEntry: WatchEntry = { ...entry, loggedAt: entry.loggedAt ?? now.toISOString(), hour: now.getHours() };
    const filtered = log.filter(e => !(e.id === entry.id && e.type === entry.type));
    localStorage.setItem('watch-log', JSON.stringify([...filtered, newEntry]));
  } catch { /* ignore */ }
}

/**
 * The log without the copies other code used to add. The login sync appended every
 * watched film from the database (hour 12, no source, dated exactly as the database
 * row) and the import dialog appended every imported film (source "import"). Both
 * repeated a date the watched index already holds, and nothing else in them is read
 * any more: 4,401 copies were 475,000 characters, a fifth of a large account's
 * storage. Entries logged in the app are kept.
 */
export function withoutCopiedEntries(log: WatchEntry[], dbWatchedAt: Map<string, string>): WatchEntry[] {
  return log.filter(e => {
    if (e.source === 'import') return false;
    const synced = !e.source && e.type === 'movie' && e.hour === 12 && dbWatchedAt.get(e.id) === e.loggedAt;
    return !synced;
  });
}

export function removeFromWatchLog(id: string, type: 'movie' | 'episode'): void {
  try {
    const log = safeParseJSON<WatchEntry[]>(safeGetItem('watch-log'), []);
    localStorage.setItem('watch-log', JSON.stringify(log.filter(e => !(e.id === id && e.type === type))));
  } catch { /* ignore */ }
}

export function saveMovieRating(id: string, rating: number): void {
  try { localStorage.setItem(`movie-rating-${id}`, String(rating)); } catch { /* ignore */ }
  recordAddedAt(id);
}
