"use client"

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

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
    const res = await fetch('/api/sync', { credentials: 'include' });
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

    for (const r of ratings) {
      try { localStorage.setItem(`movie-rating-${r.tmdbId}`, String(r.score)); } catch { /* ignore */ }
    }
    for (const w of watchlist) {
      const existing = localStorage.getItem(`watchlist-${w.tmdbId}`);
      if (!existing) {
        try { localStorage.setItem(`watchlist-${w.tmdbId}`, JSON.stringify({ id: w.tmdbId, type: w.mediaType === 'SHOW' ? 'show' : 'movie' })); } catch { /* ignore */ }
      }
    }
    for (const w of watched) {
      try { localStorage.setItem(`watched-${w.tmdbId}`, 'true'); } catch { /* ignore */ }
    }
    for (const r of reviews) {
      const existing = localStorage.getItem(`review-${r.tmdbId}`);
      if (!existing) {
        try {
          localStorage.setItem(`review-${r.tmdbId}`, JSON.stringify({
            movieId: r.tmdbId,
            content: r.body,
            containsSpoiler: r.containsSpoiler,
            date: new Date(r.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
          }));
        } catch { /* ignore */ }
      }
    }

    // Merge DB watched items into watch-log — add any items not already tracked locally
    try {
      const existing: { id: string; type: string; genre: string; language: string; hour: number; loggedAt: string }[] =
        JSON.parse(localStorage.getItem('watch-log') ?? '[]');
      const existingIds = new Set(existing.map(e => e.id));
      const newEntries: typeof existing = [];
      for (const w of watched) {
        if (existingIds.has(w.tmdbId)) continue;
        const watchedDate = new Date(w.watchedAt);
        let genre = '', language = '';
        try {
          const cached = localStorage.getItem(`meta-${w.tmdbId}`);
          if (cached) { const m = JSON.parse(cached); genre = m.genre ?? ''; language = m.language ?? ''; }
        } catch { /* ignore */ }
        newEntries.push({ id: w.tmdbId, type: 'movie', genre, language, hour: watchedDate.getHours(), loggedAt: w.watchedAt });
      }
      if (newEntries.length > 0) {
        localStorage.setItem('watch-log', JSON.stringify([...existing, ...newEntries]));
      }
    } catch { /* ignore */ }

    // Always sync signup-date from DB so it's never wrong on new devices
    try {
      const meRes = await fetch('/api/users/me', { credentials: 'include' });
      if (meRes.ok) {
        const meData = await meRes.json();
        if (meData.data?.createdAt) {
          localStorage.setItem('signup-date', meData.data.createdAt);
        }
      }
    } catch { /* ignore */ }

    // Restore favorites — only if localStorage is empty to preserve ordering
    const existingFavs = localStorage.getItem('user-favorites');
    if ((!existingFavs || existingFavs === '[]') && favorites.length > 0) {
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
    }

    // Restore custom lists from DB — always overwrite to stay in sync
    if (lists && lists.length > 0) {
      try {
        const lsLists = lists.map(l => ({
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
    }

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

      for (const w of watched) {
        if (existingKeys.has(`watched-${w.tmdbId}`)) continue;
        const { title, poster, year } = getMeta(w.tmdbId);
        newEntries.push({ id: `db-w-${w.tmdbId}`, action: 'watched', contentId: w.tmdbId, contentTitle: title, contentPoster: poster, contentYear: year, timestamp: w.watchedAt, likes: [] });
      }
      for (const r of ratings) {
        if (existingKeys.has(`rated-${r.tmdbId}`)) continue;
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
