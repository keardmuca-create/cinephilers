import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { withoutCopiedEntries, type WatchEntry } from './watch-log';

// The copies were a fifth of a large account's storage. If either writer comes back,
// every login or import refills the log with them.
describe('nothing copies whole libraries into the watch log', () => {
  const read = (...p: string[]) => readFileSync(join(process.cwd(), 'src', ...p), 'utf8');

  it('the login sync does not append database rows', () => {
    const src = read('contexts', 'auth-context.tsx');
    expect(src).not.toMatch(/newEntries\.push\(\{ id: w\.tmdbId/);
    expect(src).toContain('withoutCopiedEntries');
  });

  it('the import dialog does not write the watch log', () => {
    expect(read('components', 'import-dialog.tsx')).not.toContain("setItem('watch-log'");
  });
});

describe('withoutCopiedEntries', () => {
  const db = new Map([
    ['tmdb-157336', '2012-01-01T00:00:00.000Z'],
    ['tmdb-155', '2008-07-18T00:00:00.000Z'],
  ]);

  it('drops the copy the login sync made of a database row', () => {
    const log: WatchEntry[] = [{ id: 'tmdb-157336', type: 'movie', genre: '', language: '', hour: 12, loggedAt: '2012-01-01T00:00:00.000Z' }];
    expect(withoutCopiedEntries(log, db)).toEqual([]);
  });

  it('drops the copy the import dialog made', () => {
    const log: WatchEntry[] = [{ id: 'tmdb-27205', type: 'movie', genre: '', language: 'en', hour: 12, loggedAt: '2010-07-16T00:00:00.000Z', source: 'import' }];
    expect(withoutCopiedEntries(log, db)).toEqual([]);
  });

  it('keeps a film logged in the app, an episode, and anything the database does not date the same way', () => {
    const inApp: WatchEntry = { id: 'tmdb-155', type: 'movie', genre: 'Drama', language: 'en', hour: 21, loggedAt: '2026-09-01T19:04:11.000Z' };
    const episode: WatchEntry = { id: 'tmdb-tv-1396-S1E1', type: 'episode', genre: '', language: '', hour: 12, loggedAt: '2024-05-02T00:00:00.000Z' };
    const noonTap: WatchEntry = { id: 'tmdb-157336', type: 'movie', genre: '', language: '', hour: 12, loggedAt: '2026-09-02T12:15:00.000Z' };
    expect(withoutCopiedEntries([inApp, episode, noonTap], db)).toEqual([inApp, episode, noonTap]);
  });
});
