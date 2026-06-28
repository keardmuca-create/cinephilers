"use client"

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { canonicalId, normalizeLocalMediaIds, recordAddedAt, recordWatchedAt } from '@/lib/media-id';
import { batchFetchMeta } from '@/lib/meta-batch';
import { clearUserData } from '@/lib/clear-user-data';

const STORAGE_KEY = 'cinephilers_user';

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  isVerified: boolean;
  isPrivate: boolean;
  role: string;
  ratingsCount: number;
  reviewsCount: number;
  followersCount: number;
  followingCount: number;
}

function saveUserToStorage(user: AuthUser | null) {
  try {
    if (user) localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    else localStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}

function loadUserFromStorage(): AuthUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch { return null; }
}

async function restoreFromDb() {
  try {
    // Fire both requests in parallel to save one round-trip (~300-500ms)
    const [res, meResEarly] = await Promise.all([
      fetch('/api/sync', { credentials: 'include' }),
      fetch('/api/users/me', { credentials: 'include' }),
    ]);
    if (!res.ok) return;
    const { data } = await res.json();
    const { ratings: ratingsRaw, watchlist: watchlistRaw, watched: watchedRaw, reviews: reviewsRaw, favorites: favoritesRaw, lists: listsRaw, hidden } = data as {
      ratings: { tmdbId: string; mediaType: string; score: number; createdAt: string; updatedAt: string }[];
      watchlist: { tmdbId: string; mediaType: string; addedAt: string }[];
      watched: { tmdbId: string; mediaType: string; watchedAt: string }[];
      reviews: { tmdbId: string; mediaType: string; body: string; containsSpoiler: boolean; createdAt: string }[];
      favorites: { tmdbId: string; mediaType: string }[];
      lists: { id: string; name: string; isPublic: boolean; createdAt: string; items: { tmdbId: string; mediaType: string; title: string | null; poster: string | null; year: string | null }[] }[];
      hidden?: { type: string; tmdbId: string }[];
    };

    // Fold any legacy bare-numeric movie keys already in localStorage into the
    // canonical `tmdb-{n}` form before we read/compare them below — otherwise a film
    // imported under the old format and watched under the new one shows up twice.
    normalizeLocalMediaIds();

    // Canonicalize every id coming from the DB too, so a leftover bare-id row can't
    // re-create the duplicate localStorage key on this sync.
    const ratings = ratingsRaw.map(r => ({ ...r, tmdbId: canonicalId(r.tmdbId) }));
    const watchlist = watchlistRaw.map(w => ({ ...w, tmdbId: canonicalId(w.tmdbId) }));
    const reviews = reviewsRaw.map(r => ({ ...r, tmdbId: canonicalId(r.tmdbId) }));
    const favorites = favoritesRaw.map(f => ({ ...f, tmdbId: canonicalId(f.tmdbId) }));
    const lists = listsRaw.map(l => ({ ...l, items: l.items.map(i => ({ ...i, tmdbId: canonicalId(i.tmdbId) })) }));

    // Episode ids look like "tmdb-tv-123-S1E2". An earlier sync bug uploaded them to
    // the movie/show watched table; left there, they get rewritten as watched-<id>
    // keys on every load and resurrect episodes the user deleted from history. Drop
    // them from all downstream watched processing and self-heal by deleting the rows.
    const isEpisodeId = (id: string) => /-S\d+E\d+$/.test(id);
    const watched = watchedRaw
      .filter(w => {
        if (isEpisodeId(w.tmdbId)) {
          fetchWithAuth(`/api/watched/${w.tmdbId}?mediaType=SHOW`, { method: 'DELETE' }).catch(() => {});
          return false;
        }
        return true;
      })
      .map(w => ({ ...w, tmdbId: canonicalId(w.tmdbId) }));

    // Feed activities the user removed (on any device) — merge server's hidden list into
    // the local dismissed set so this device also hides them and never re-adds them below.
    try {
      const local = new Set<string>(JSON.parse(localStorage.getItem('activity-dismissed') ?? '[]'));
      for (const h of hidden ?? []) local.add(`${h.type}-${h.tmdbId}`);
      localStorage.setItem('activity-dismissed', JSON.stringify([...local].slice(-500)));
    } catch { /* ignore */ }

    // ── Ratings: DB → local only. We deliberately do NOT upload local-only
    // ratings: on a shared browser, switching accounts could push one account's
    // ratings into another's DB — and since rating auto-marks watched, that
    // balloons the wrong account's history. Ratings already persist at action
    // time via syncDb; this sync only mirrors the DB down. ──
    for (const r of ratings) {
      try { localStorage.setItem(`movie-rating-${r.tmdbId}`, String(r.score)); } catch { /* ignore */ }
      recordAddedAt(r.tmdbId, r.createdAt);
    }

    // ── Watchlist: DB → local only (same one-way rule as ratings/watched, so a
    // shared-browser account switch can't push one account's watchlist into
    // another's DB). Watchlist changes persist at action time via syncDb. ──
    for (const w of watchlist) {
      try {
        const existing = localStorage.getItem(`watchlist-${w.tmdbId}`);
        const parsed = existing ? JSON.parse(existing) : null;
        // Only overwrite if there's no existing entry with title metadata
        if (!parsed?.title) {
          localStorage.setItem(`watchlist-${w.tmdbId}`, JSON.stringify({ id: w.tmdbId, type: w.mediaType === 'SHOW' ? 'show' : 'movie' }));
        }
      } catch { /* ignore */ }
      recordAddedAt(w.tmdbId, w.addedAt);
    }

    // ── Watched: the DB is the source of truth. Write DB items to local only. ──
    // We deliberately do NOT recover from watch-log or upload local-only watched
    // items here: doing so let a shared-browser session leak one account's watched
    // movies into another account's DB (stamped watchedAt=now) and resurrected
    // deleted/unchecked-import titles. Watched state syncs one way: DB → local.
    for (const w of watched) {
      try { localStorage.setItem(`watched-${w.tmdbId}`, 'true'); } catch { /* ignore */ }
      recordWatchedAt(w.tmdbId, w.watchedAt);
    }

    // ── Reviews: DB → local only (same one-way rule — never upload local-only
    // reviews, which on a shared browser could belong to another account). ──
    for (const r of reviews) {
      try {
        // Preserve title/poster/year from existing local entry or meta cache
        // so the profile reviews section can always show the poster
        let movieTitle = '', moviePoster = '', movieYear = '';
        try {
          const existing = localStorage.getItem(`review-${r.tmdbId}`);
          if (existing) {
            const e = JSON.parse(existing);
            movieTitle = e.movieTitle ?? '';
            moviePoster = e.moviePoster ?? '';
            movieYear = e.movieYear ?? '';
          }
          if (!moviePoster) {
            const meta = localStorage.getItem(`meta-${r.tmdbId}`);
            if (meta) { const m = JSON.parse(meta); movieTitle = m.title ?? ''; moviePoster = m.poster ?? ''; movieYear = m.year ?? ''; }
          }
        } catch { /* ignore */ }
        localStorage.setItem(`review-${r.tmdbId}`, JSON.stringify({
          movieId: r.tmdbId,
          movieTitle,
          moviePoster,
          movieYear,
          content: r.body,
          containsSpoiler: r.containsSpoiler,
          date: new Date(r.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
        }));
      } catch { /* ignore */ }
    }

    // Merge DB watched items into watch-log — add any items not already tracked locally
    try {
      const existing: { id: string; type: string; genre: string; language: string; hour: number; loggedAt: string }[] =
        JSON.parse(localStorage.getItem('watch-log') ?? '[]');
      const existingIds = new Set(existing.map(e => e.id));
      const newEntries: typeof existing = [];
      for (const w of watched) {
        if (existingIds.has(w.tmdbId)) continue;
        let genre = '', language = '';
        try {
          const cached = localStorage.getItem(`meta-${w.tmdbId}`);
          if (cached) { const m = JSON.parse(cached); genre = m.genre ?? ''; language = m.language ?? ''; }
        } catch { /* ignore */ }
        // hour fixed to 12: imported/synced dates are often midnight, which would
        // falsely count every film toward the Night Owl (12am-4am) badge
        newEntries.push({ id: w.tmdbId, type: 'movie', genre, language, hour: 12, loggedAt: w.watchedAt });
      }
      if (newEntries.length > 0) {
        localStorage.setItem('watch-log', JSON.stringify([...existing, ...newEntries]));
      }
    } catch { /* ignore */ }

    // Always sync signup-date and following-count from DB so badges work on every device
    try {
      if (meResEarly.ok) {
        const meData = await meResEarly.json();
        if (meData.data?.createdAt) {
          localStorage.setItem('signup-date', meData.data.createdAt);
        }
        if (typeof meData.data?.followingCount === 'number') {
          localStorage.setItem('following-count', String(meData.data.followingCount));
        }
      }
    } catch { /* ignore */ }

    // ── Favorites: always overwrite from DB — DB is the source of truth ─────────
    if (favorites.length > 0) {
      const metaMap = await batchFetchMeta(favorites.map(f => f.tmdbId));
      const favsWithMeta = favorites.map(f => {
        const m = metaMap[f.tmdbId];
        if (!m) return null;
        return { id: f.tmdbId, title: m.title, year: m.year, poster: m.poster, type: (m.type ?? (f.mediaType === 'SHOW' ? 'show' : 'movie')) as 'movie' | 'show' };
      });
      const resolved = favsWithMeta.filter(Boolean);
      if (resolved.length > 0) {
        try { localStorage.setItem('user-favorites', JSON.stringify(resolved)); } catch { /* ignore */ }
      }
    } else {
      // No favorites in DB — clear local so the device matches
      try { localStorage.removeItem('user-favorites'); } catch { /* ignore */ }
    }

    // ── Lists: always overwrite from DB ──────────────────────────────────────
    try {
      const lsLists = (lists ?? []).map(l => ({
        id: l.id,
        title: l.name,
        isPrivate: !l.isPublic,
        createdAt: l.createdAt,
        items: l.items.map(i => ({
          movieId: i.tmdbId,
          title: i.title ?? '',
          poster: i.poster ?? '',
          year: i.year ?? '',
          type: i.mediaType === 'SHOW' ? 'show' : 'movie',
        })),
      }));
      localStorage.setItem('user-lists', JSON.stringify(lsLists));
    } catch { /* ignore */ }

    // Merge activity-feed from DB so cross-device watched/rated entries appear in the social feed
    try {
      type ActivityEntry = { id: string; action: string; contentId: string; contentTitle: string; contentPoster: string; contentYear: string; rating?: number; timestamp: string; likes: string[] };
      const existing: ActivityEntry[] = JSON.parse(localStorage.getItem('activity-feed') ?? '[]');
      const existingKeys = new Set(existing.map(e => `${e.action}-${e.contentId}`));
      // Activities the user removed from their feed must not be resurrected by DB sync
      const dismissed = new Set<string>(JSON.parse(localStorage.getItem('activity-dismissed') ?? '[]'));
      const newEntries: ActivityEntry[] = [];

      const getMeta = (tmdbId: string) => {
        try {
          const cached = localStorage.getItem(`meta-${tmdbId}`);
          if (cached) { const m = JSON.parse(cached); return { title: m.title ?? '', poster: m.poster ?? '', year: m.year ?? '' }; }
        } catch { /* ignore */ }
        return { title: '', poster: '', year: '' };
      };

      // Only sync recent activity (last 30 days) — bulk imports have old dates and must not flood the feed
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      for (const w of watched) {
        if (existingKeys.has(`watched-${w.tmdbId}`)) continue;
        if (dismissed.has(`watched-${w.tmdbId}`)) continue;
        if (new Date(w.watchedAt) < cutoff) continue;
        const { title, poster, year } = getMeta(w.tmdbId);
        newEntries.push({ id: `db-w-${w.tmdbId}`, action: 'watched', contentId: w.tmdbId, contentTitle: title, contentPoster: poster, contentYear: year, timestamp: w.watchedAt, likes: [] });
      }
      for (const r of ratings) {
        if (existingKeys.has(`rated-${r.tmdbId}`)) continue;
        if (dismissed.has(`rated-${r.tmdbId}`)) continue;
        if (new Date(r.updatedAt) < cutoff) continue;
        const { title, poster, year } = getMeta(r.tmdbId);
        newEntries.push({ id: `db-r-${r.tmdbId}`, action: 'rated', contentId: r.tmdbId, contentTitle: title, contentPoster: poster, contentYear: year, rating: r.score, timestamp: r.updatedAt, likes: [] });
      }

      if (newEntries.length > 0) {
        const merged = [...existing, ...newEntries]
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          .slice(0, 100);
        localStorage.setItem('activity-feed', JSON.stringify(merged));
      }
    } catch { /* ignore */ }

    // Signal to any mounted pages that localStorage is now populated from DB
    window.dispatchEvent(new CustomEvent('cinephilers-db-restored'));
  } catch { /* ignore */ }
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  refetch: () => Promise<void>;
  logout: () => Promise<void>;
  updateUserLocally: (patch: Partial<AuthUser>) => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  refetch: async () => {},
  logout: async () => {},
  updateUserLocally: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Load from localStorage on first client render
  useEffect(() => {
    const stored = loadUserFromStorage();
    if (stored) setUser(stored);
  }, []);

  const refetch = useCallback(async () => {
    try {
      let res = await fetch('/api/users/me', { credentials: 'include' });
      if (res.status === 401) {
        // Access token expired (e.g. app reopened after 15+ min). Without this retry,
        // the user looks logged in (cached) but restoreFromDb never runs — no data syncs.
        const refreshRes = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' }).catch(() => null);
        if (refreshRes?.ok) {
          res = await fetch('/api/users/me', { credentials: 'include' });
        }
      }
      if (res.ok) {
        const data = await res.json();
        const fresh = data.data as AuthUser;
        setUser(fresh);
        saveUserToStorage(fresh);
        if (typeof fresh.followingCount === 'number') {
          try { localStorage.setItem('following-count', String(fresh.followingCount)); } catch { /* ignore */ }
        }
        // Restore user data from DB into localStorage
        restoreFromDb();
      } else {
        // API failed (e.g. mock DB cold-started) — keep whatever we have from localStorage
        const stored = loadUserFromStorage();
        if (stored) setUser(stored);
        else setUser(null);
      }
    } catch {
      const stored = loadUserFromStorage();
      if (stored) setUser(stored);
      else setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const updateUserLocally = useCallback((patch: Partial<AuthUser>) => {
    setUser(prev => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      saveUserToStorage(next);
      return next;
    });
  }, []);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    clearUserData();
    window.location.href = '/login';
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  // If any fetchWithAuth call fails to refresh, the session is dead — log out
  useEffect(() => {
    const handle = () => {
      setUser(null);
      saveUserToStorage(null);
      window.location.href = '/login';
    };
    window.addEventListener('session-expired', handle);
    return () => window.removeEventListener('session-expired', handle);
  }, []);

  // Silently refresh the access token every 10 minutes so it never expires mid-session.
  // This ensures background syncDb calls (watch, rate, etc.) always reach the server.
  useEffect(() => {
    const id = setInterval(() => {
      fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' }).catch(() => {});
    }, 10 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, refetch, logout, updateUserLocally }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
