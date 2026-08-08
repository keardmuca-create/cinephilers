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

import { canonicalId, legacyTwin, recordAddedAt, getAddedAt, recordWatchedAt, getWatchedAtISO, recordRatedAt, getRatedAt, removeRatedAt } from './media-id';

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

describe('the rated-at index', () => {
  beforeEach(() => {
    installLocalStorageStub();
  });

  // The Get Out bug, exactly as reported: a film saved to the watchlist on 17
  // July and rated on 8 August. The add index keeps the EARLIEST date by design,
  // so before this index existed the ratings list showed 17 July under the words
  // "Rated on" and sorted it three weeks out of place.
  it('keeps the rating date separate from the add date', () => {
    recordAddedAt('tmdb-419430', '2026-07-17T10:00:00.000Z');   // watchlisted
    recordRatedAt('tmdb-419430', '2026-08-08T20:00:00.000Z');   // rated later

    expect(new Date(getAddedAt('tmdb-419430')).toISOString()).toBe('2026-07-17T10:00:00.000Z');
    expect(new Date(getRatedAt('tmdb-419430')).toISOString()).toBe('2026-08-08T20:00:00.000Z');
  });

  it('sorts a later rating above an earlier one regardless of when each was added', () => {
    recordAddedAt('tmdb-old', '2026-07-17T10:00:00.000Z');
    recordRatedAt('tmdb-old', '2026-08-08T20:00:00.000Z');      // added first, rated LAST
    recordAddedAt('tmdb-new', '2026-08-01T10:00:00.000Z');
    recordRatedAt('tmdb-new', '2026-08-02T10:00:00.000Z');      // added last, rated FIRST

    // Newest rating first — which is what "Date rated, descending" promises.
    expect(getRatedAt('tmdb-old')).toBeGreaterThan(getRatedAt('tmdb-new'));
    // And the add index still answers its own question the other way round.
    expect(getAddedAt('tmdb-old')).toBeLessThan(getAddedAt('tmdb-new'));
  });

  it('keeps the LATER timestamp when re-rated', () => {
    recordRatedAt('tmdb-1', '2026-01-01T00:00:00.000Z');
    recordRatedAt('tmdb-1', '2026-09-01T00:00:00.000Z');
    expect(new Date(getRatedAt('tmdb-1')).toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  // Ratings made before this index existed have no entry. Falling back to the
  // add date is wrong-but-close; sorting years of history to 1970 is just wrong.
  it('falls back to the add date when no rating date was ever recorded', () => {
    recordAddedAt('tmdb-legacy', '2026-03-03T00:00:00.000Z');
    expect(new Date(getRatedAt('tmdb-legacy')).toISOString()).toBe('2026-03-03T00:00:00.000Z');
  });

  it('is cleared when a rating is removed, and falls back again', () => {
    recordAddedAt('tmdb-2', '2026-05-05T00:00:00.000Z');
    recordRatedAt('tmdb-2', '2026-06-06T00:00:00.000Z');
    removeRatedAt('tmdb-2');
    expect(new Date(getRatedAt('tmdb-2')).toISOString()).toBe('2026-05-05T00:00:00.000Z');
  });

  it('returns 0 for an id with no dates at all, so it sorts last', () => {
    expect(getRatedAt('tmdb-999')).toBe(0);
  });
});
