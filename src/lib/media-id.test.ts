import { describe, it, expect, beforeEach, vi } from 'vitest';

// Minimal in-memory localStorage so the index helpers run under the node env.
function installLocalStorageStub() {
  const store = new Map<string, string>();
  const ls = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
  vi.stubGlobal('localStorage', ls);
  return ls;
}

import { canonicalId, legacyTwin, recordAddedAt, getAddedAt, recordWatchedAt, getWatchedAtISO } from './media-id';

describe('canonicalId', () => {
  it('folds a bare numeric id into the tmdb- form', () => {
    expect(canonicalId('262504')).toBe('tmdb-262504');
  });

  it('leaves an already-canonical movie id alone', () => {
    expect(canonicalId('tmdb-262504')).toBe('tmdb-262504');
  });

  it('leaves a tv id alone', () => {
    expect(canonicalId('tmdb-tv-123')).toBe('tmdb-tv-123');
  });

  it('leaves an episode id alone', () => {
    expect(canonicalId('tmdb-tv-123-S2E5')).toBe('tmdb-tv-123-S2E5');
  });
});

describe('legacyTwin', () => {
  it('returns the bare number for a canonical movie id', () => {
    expect(legacyTwin('tmdb-262504')).toBe('262504');
  });

  it('returns null for a tv id', () => {
    expect(legacyTwin('tmdb-tv-123')).toBeNull();
  });

  it('returns null for an episode id', () => {
    expect(legacyTwin('tmdb-tv-123-S2E5')).toBeNull();
  });

  it('returns null for a bare numeric id', () => {
    expect(legacyTwin('262504')).toBeNull();
  });
});

describe('added-at index (earliest wins)', () => {
  beforeEach(() => {
    installLocalStorageStub();
  });

  it('records and reads back a timestamp by canonical id', () => {
    recordAddedAt('tmdb-1', '2024-01-10T00:00:00.000Z');
    expect(getAddedAt('tmdb-1')).toBe(Date.parse('2024-01-10T00:00:00.000Z'));
  });

  it('keys a bare id under its canonical form', () => {
    recordAddedAt('1', '2024-01-10T00:00:00.000Z');
    expect(getAddedAt('tmdb-1')).toBe(Date.parse('2024-01-10T00:00:00.000Z'));
  });

  it('keeps the EARLIER timestamp when re-recorded', () => {
    recordAddedAt('tmdb-1', '2024-05-01T00:00:00.000Z');
    recordAddedAt('tmdb-1', '2024-01-01T00:00:00.000Z'); // earlier — should win
    expect(getAddedAt('tmdb-1')).toBe(Date.parse('2024-01-01T00:00:00.000Z'));
  });

  it('does not overwrite with a LATER timestamp', () => {
    recordAddedAt('tmdb-1', '2024-01-01T00:00:00.000Z');
    recordAddedAt('tmdb-1', '2024-09-01T00:00:00.000Z'); // later — ignored
    expect(getAddedAt('tmdb-1')).toBe(Date.parse('2024-01-01T00:00:00.000Z'));
  });

  it('returns 0 for an unknown id', () => {
    expect(getAddedAt('tmdb-999')).toBe(0);
  });
});

describe('watched-at index (latest wins)', () => {
  beforeEach(() => {
    installLocalStorageStub();
  });

  it('keeps the LATER timestamp when re-recorded', () => {
    recordWatchedAt('tmdb-1', '2024-01-01T00:00:00.000Z');
    recordWatchedAt('tmdb-1', '2024-09-01T00:00:00.000Z'); // later — should win
    expect(getWatchedAtISO('tmdb-1')).toBe('2024-09-01T00:00:00.000Z');
  });

  it('does not overwrite with an EARLIER timestamp', () => {
    recordWatchedAt('tmdb-1', '2024-09-01T00:00:00.000Z');
    recordWatchedAt('tmdb-1', '2024-01-01T00:00:00.000Z'); // earlier — ignored
    expect(getWatchedAtISO('tmdb-1')).toBe('2024-09-01T00:00:00.000Z');
  });

  it('returns null for an unknown id', () => {
    expect(getWatchedAtISO('tmdb-999')).toBeNull();
  });
});
