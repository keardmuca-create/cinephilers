"use client"

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { fetchWithAuth } from '@/lib/fetch-with-auth';

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
    const { ratings, watchlist, watched, reviews, favorites, lists } = data as {
      ratings: { tmdbId: string; mediaType: string; score: number; updatedAt: string }[];
      watchlist: { tmdbId: string; mediaType: string }[];
      watched: { tmdbId: string; mediaType: string; watchedAt: string }[];
      reviews: { tmdbId: string; mediaType: string; body: string; containsSpoiler: boolean; createdAt: string }[];
      favorites: { tmdbId: string; mediaType: string }[];
      lists: { id: string; name: string; isPublic: boolean; createdAt: string; items: { tmdbId: string; mediaType: string; title: string | null; poster: string | null; year: string | null }[] }[];
    };

    // ── Ratings: write DB scores to local; upload any local-only ratings to DB ──
    const dbRatingIds = new Set(ratings.map(r => r.tmdbId));
    for (const r of ratings) {
      try { localStorage.setItem(`movie-rating-${r.tmdbId}`, String(r.score)); } catch { /* ignore */ }
    }
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k?.startsWith('movie-rating-')) continue;
        const tmdbId = k.slice('movie-rating-'.length);
        if (dbRatingIds.has(tmdbId)) continue;
        const score = parseInt(localStorage.getItem(k) ?? '0', 10);
        if (score >= 1 && score <= 10) {
          const mediaType = tmdbId.startsWith('tmdb-tv-') ? 'SHOW' : 'MOVIE';
          fetchWithAuth('/api/ratings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tmdbId, mediaType, score }) }).catch(() => {});
        }
      }
    } catch { /* ignore */ }

    // ── Watchlist: write DB items to local; upload any local-only items to DB ──
    const dbWatchlistIds = new Set(watchlist.map(w => w.tmdbId));
    for (const w of watchlist) {
      try {
        const existing = localStorage.getItem(`watchlist-${w.tmdbId}`);
        const parsed = existing ? JSON.parse(existing) : null;
        // Only overwrite if there's no existing entry with title metadata
        if (!parsed?.title) {
          localStorage.setItem(`watchlist-${w.tmdbId}`, JSON.stringify({ id: w.tmdbId, type: w.mediaType === 'SHOW' ? 'show' : 'movie' }));
        }
      } catch { /* ignore */ }
    }
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k?.startsWith('watchlist-')) continue;
        const tmdbId = k.slice('watchlist-'.length);
        if (dbWatchlistIds.has(tmdbId)) continue;
        const mediaType = tmdbId.startsWith('tmdb-tv-') ? 'SHOW' : 'MOVIE';
        fetchWithAuth('/api/watchlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tmdbId, mediaType }) }).catch(() => {});
      }
    } catch { /* ignore */ }

    // ── Watched: write DB items to local; recover from watch-log + upload ────
    const dbWatchedIds = new Set(watched.map(w => w.tmdbId));
    for (const w of watched) {
      try { localStorage.setItem(`watched-${w.tmdbId}`, 'true'); } catch { /* ignore */ }
    }
    // Recover watched state from watch-log (survives even if watched-* keys were wiped)
    // and upload any items not yet in DB so they're safe on every device going forward
    try {
      const watchLog: { id: string }[] = JSON.parse(localStorage.getItem('watch-log') ?? '[]');
      for (const entry of watchLog) {
        if (!entry.id) continue;
        try { localStorage.setItem(`watched-${entry.id}`, 'true'); } catch { /* ignore */ }
        if (!dbWatchedIds.has(entry.id)) {
          const mediaType = entry.id.startsWith('tmdb-tv-') ? 'SHOW' : 'MOVIE';
          fetchWithAuth('/api/watched', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tmdbId: entry.id, mediaType }) }).catch(() => {});
          dbWatchedIds.add(entry.id); // prevent duplicate uploads within this loop
        }
      }
    } catch { /* ignore */ }

    // ── Reviews: write DB reviews to local; upload any local-only reviews to DB
    const dbReviewIds = new Set(reviews.map(r => r.tmdbId));
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
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k?.startsWith('review-')) continue;
        const tmdbId = k.slice('review-'.length);
        if (dbReviewIds.has(tmdbId)) continue;
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        try {
          const rev = JSON.parse(raw) as { content?: string; containsSpoiler?: boolean };
          if (rev.content) {
            const mediaType = tmdbId.startsWith('tmdb-tv-') ? 'SHOW' : 'MOVIE';
            fetchWithAuth('/api/reviews', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tmdbId, mediaType, body: rev.content, containsSpoiler: rev.containsSpoiler ?? false }) }).catch(() => {});
          }
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }

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

    // Always sync signup-date from DB so it's never wrong on new devices
    try {
      if (meResEarly.ok) {
        const meData = await meResEarly.json();
        if (meData.data?.createdAt) {
          localStorage.setItem('signup-date', meData.data.createdAt);
        }
      }
    } catch { /* ignore */ }

    // ── Favorites: always overwrite from DB — DB is the source of truth ─────────
    if (favorites.length > 0) {
      const favsWithMeta = await Promise.all(
        favorites.map(async (f) => {
          // Try meta cache first
          try {
            const cached = localStorage.getItem(`meta-${f.tmdbId}`);
            if (cached) {
              const m = JSON.parse(cached);
              return { id: f.tmdbId, title: m.title, year: m.year, poster: m.poster, type: (m.type ?? (f.mediaType === 'SHOW' ? 'show' : 'movie')) as 'movie' | 'show' };
            }
          } catch { /* ignore */ }
          // Fetch from meta API
          try {
            const metaRes = await fetch(`/api/meta/${f.tmdbId}`);
            if (metaRes.ok) {
              const m = await metaRes.json();
              return { id: f.tmdbId, title: m.title, year: m.year, poster: m.poster, type: (m.type ?? (f.mediaType === 'SHOW' ? 'show' : 'movie')) as 'movie' | 'show' };
            }
          } catch { /* ignore */ }
          return null;
        })
      );
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
        if (new Date(w.watchedAt) < cutoff) continue;
        const { title, poster, year } = getMeta(w.tmdbId);
        newEntries.push({ id: `db-w-${w.tmdbId}`, action: 'watched', contentId: w.tmdbId, contentTitle: title, contentPoster: poster, contentYear: year, timestamp: w.watchedAt, likes: [] });
      }
      for (const r of ratings) {
        if (existingKeys.has(`rated-${r.tmdbId}`)) continue;
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
      const res = await fetch('/api/users/me', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const fresh = data.data as AuthUser;
        setUser(fresh);
        saveUserToStorage(fresh);
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
    // Clear all user data from localStorage
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (
          k === STORAGE_KEY ||
          k === 'recently-viewed' ||
          k === 'watch-log' ||
          k === 'user-favorites' ||
          k === 'user-lists' ||
          k.startsWith('movie-rating-') ||
          k.startsWith('watchlist-') ||
          k.startsWith('watched-') ||
          k.startsWith('meta-') ||
          k.startsWith('review-')
        ) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
    } catch { /* ignore */ }
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
