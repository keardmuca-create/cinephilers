import { describe, it, expect, beforeEach } from 'vitest';
import { readWatchedState, readEpisodeProgress } from './watched-state';

const FILM = 'tmdb-27205';
const SHOW = 'tmdb-tv-1402';

// The suite runs in node, so stand up just enough of localStorage to read from.
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => { store.clear(); },
};

beforeEach(() => {
  store.clear();
});

describe('readWatchedState', () => {
  it('says nothing about a title that was never touched', () => {
    expect(readWatchedState(FILM)).toBe('none');
    expect(readWatchedState(SHOW)).toBe('none');
  });

  it('fills the eye for a watched film', () => {
    localStorage.setItem(`watched-${FILM}`, 'true');
    expect(readWatchedState(FILM)).toBe('complete');
  });

  it('treats a show marked through the button as finished', () => {
    localStorage.setItem(`show-status-${SHOW}`, 'completed');
    expect(readWatchedState(SHOW)).toBe('complete');
  });

  it('is partial for a show with some episodes ticked', () => {
    localStorage.setItem(`watched-eps-index-${SHOW}`, JSON.stringify(['S1E1', 'S1E2']));
    expect(readWatchedState(SHOW)).toBe('partial');
  });

  it('is partial for a single guest-star episode', () => {
    localStorage.setItem(`watched-eps-index-${SHOW}`, JSON.stringify(['S4E3']));
    expect(readWatchedState(SHOW)).toBe('partial');
  });

  // Watching a show through episode by episode never writes show-status, so the
  // only way to know it's finished is to count against the total.
  it('fills the eye when the episode count reaches the cached total', () => {
    localStorage.setItem(`watched-eps-index-${SHOW}`, JSON.stringify(['S1E1', 'S1E2', 'S1E3']));
    localStorage.setItem(`meta-${SHOW}`, JSON.stringify({ totalEps: 3 }));
    expect(readWatchedState(SHOW)).toBe('complete');
  });

  it('stays partial when the total is not cached yet', () => {
    localStorage.setItem(`watched-eps-index-${SHOW}`, JSON.stringify(['S1E1', 'S1E2', 'S1E3']));
    expect(readWatchedState(SHOW)).toBe('partial');
  });

  it('treats an emptied episode index as untouched', () => {
    localStorage.setItem(`watched-eps-index-${SHOW}`, JSON.stringify([]));
    expect(readWatchedState(SHOW)).toBe('none');
  });

  it('survives corrupt storage', () => {
    localStorage.setItem(`watched-eps-index-${SHOW}`, 'not json');
    expect(readWatchedState(SHOW)).toBe('none');
  });
});

describe('readEpisodeProgress', () => {
  it('counts against the total when it is known', () => {
    localStorage.setItem(`watched-eps-index-${SHOW}`, JSON.stringify(['S1E1', 'S1E2', 'S1E3']));
    localStorage.setItem(`meta-${SHOW}`, JSON.stringify({ totalEps: 67 }));
    expect(readEpisodeProgress(SHOW)).toBe('3 / 67');
  });

  it('says nothing rather than a bare count when the total is not cached', () => {
    localStorage.setItem(`watched-eps-index-${SHOW}`, JSON.stringify(['S1E1', 'S1E2']));
    expect(readEpisodeProgress(SHOW)).toBeNull();
  });

  it('is a fraction for the guest-star case too', () => {
    localStorage.setItem(`watched-eps-index-${SHOW}`, JSON.stringify(['S4E3']));
    localStorage.setItem(`meta-${SHOW}`, JSON.stringify({ totalEps: 73 }));
    expect(readEpisodeProgress(SHOW)).toBe('1 / 73');
  });

  it('says nothing about a finished show or a film', () => {
    localStorage.setItem(`show-status-${SHOW}`, 'completed');
    localStorage.setItem(`watched-${FILM}`, 'true');
    expect(readEpisodeProgress(SHOW)).toBeNull();
    expect(readEpisodeProgress(FILM)).toBeNull();
  });
});
