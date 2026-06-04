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
    const { ratings, watchlist, watched, reviews } = data as {
      ratings: { tmdbId: string; mediaType: string; score: number }[];
      watchlist: { tmdbId: string; mediaType: string }[];
      watched: { tmdbId: string; mediaType: string }[];
      reviews: { tmdbId: string; mediaType: string; body: string; containsSpoiler: boolean; createdAt: string }[];
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

  return (
    <AuthContext.Provider value={{ user, loading, refetch, logout, updateUserLocally }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
