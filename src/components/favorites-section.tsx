"use client"

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, X, Search, Heart, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { useAuth } from '@/contexts/auth-context';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

interface FavoriteItem {
  id: string;
  title: string;
  year: string;
  poster: string;
  type: 'movie' | 'show';
}

const FAVORITES_KEY = 'user-favorites';
const MAX_FAVORITES = 10;

function loadFavorites(): FavoriteItem[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function saveFavorites(items: FavoriteItem[]) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(items));
}

export function FavoritesSection() {
  const { user } = useAuth();
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [swapIndex, setSwapIndex] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FavoriteItem[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragIndexRef = useRef<number | null>(null);

  useEffect(() => {
    // Load from localStorage immediately for fast render
    const local = loadFavorites();
    if (local.length > 0) setFavorites(local);

    // Then hydrate from DB so favorites survive new devices/cleared storage
    if (!user) return;
    fetch(`/api/users/${user.username}/favorites`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(async json => {
        const dbItems: { id: string; tmdbId: string; mediaType: string }[] = json?.data ?? [];
        if (dbItems.length === 0) return;
        // local item.id === db.tmdbId — build merged list preserving local metadata
        const localByTmdbId = new Map(local.map(f => [f.id, f]));
        const merged: FavoriteItem[] = await Promise.all(dbItems.map(async db => {
          if (localByTmdbId.has(db.tmdbId)) return localByTmdbId.get(db.tmdbId)!;
          // Not in localStorage — fetch meta from API
          try {
            const res = await fetch(`/api/meta/${db.tmdbId}`);
            if (res.ok) {
              const m = await res.json();
              return { id: db.tmdbId, title: m.title ?? '', year: m.year ?? '', poster: m.poster ?? '', type: db.mediaType === 'SHOW' ? 'show' as const : 'movie' as const };
            }
          } catch { /* ignore */ }
          return { id: db.tmdbId, title: '', year: '', poster: '', type: db.mediaType === 'SHOW' ? 'show' as const : 'movie' as const };
        }));
        setFavorites(merged);
        saveFavorites(merged);
      })
      .catch(() => {});

    const onDbRestored = () => setFavorites(loadFavorites());
    window.addEventListener('cinephilers-db-restored', onDbRestored);
    return () => window.removeEventListener('cinephilers-db-restored', onDbRestored);
  }, [user]);

  const updateFavorites = useCallback((items: FavoriteItem[]) => {
    setFavorites(items);
    saveFavorites(items);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/movies/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setResults(
          (data.results ?? []).slice(0, 8).map((m: { id: string; title: string; year: string; poster: string; type: 'movie' | 'show' }) => ({
            id: m.id,
            title: m.title,
            year: m.year,
            poster: m.poster,
            type: m.type,
          }))
        );
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
  }, [query]);

  const openSearch = (index?: number) => {
    setSwapIndex(index ?? null);
    setQuery('');
    setResults([]);
    setSearchOpen(true);
  };

  const syncFavoriteDb = (method: string, item: FavoriteItem) => {
    const mediaType = item.type === 'show' ? 'SHOW' : 'MOVIE';
    if (method === 'POST') {
      fetchWithAuth('/api/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tmdbId: item.id, mediaType }),
      }).catch(() => {});
    } else {
      fetchWithAuth(`/api/favorites/${item.id}?mediaType=${mediaType}`, { method: 'DELETE' }).catch(() => {});
    }
  };

  const addFavorite = (item: FavoriteItem) => {
    if (swapIndex !== null) {
      const removed = favorites[swapIndex];
      const updated = [...favorites];
      updated[swapIndex] = item;
      updateFavorites(updated);
      if (removed) syncFavoriteDb('DELETE', removed);
      syncFavoriteDb('POST', item);
    } else {
      if (favorites.length >= MAX_FAVORITES) return;
      updateFavorites([...favorites, item]);
      syncFavoriteDb('POST', item);
    }
    setSearchOpen(false);
  };

  const removeFavorite = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const removed = favorites[index];
    updateFavorites(favorites.filter((_, i) => i !== index));
    if (removed) syncFavoriteDb('DELETE', removed);
  };

  const onDragStart = (index: number) => {
    dragIndexRef.current = index;
  };

  const onDragOver = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    const src = dragIndexRef.current;
    if (src === null || src === targetIndex) return;
    setFavorites(prev => {
      const updated = [...prev];
      const [moved] = updated.splice(src, 1);
      updated.splice(targetIndex, 0, moved);
      return updated;
    });
    dragIndexRef.current = targetIndex;
  };

  const onDragEnd = () => {
    dragIndexRef.current = null;
    setFavorites(prev => { saveFavorites(prev); return prev; });
  };

  // Always show 10 slots
  const emptySlots = Math.max(0, MAX_FAVORITES - favorites.length);

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-2xl font-headline font-bold flex items-center gap-3">
          <Heart className="h-6 w-6 text-primary" /> Favorites
        </h3>
        {favorites.length < MAX_FAVORITES && (
          <button
            onClick={() => openSearch()}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground border border-border bg-muted hover:bg-muted/80 px-3 py-1.5 rounded-full transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        )}
      </div>

      <div className="grid grid-cols-5 gap-2">
        {favorites.map((fav, i) => (
          <div
            key={fav.id}
            draggable
            onDragStart={() => onDragStart(i)}
            onDragOver={e => onDragOver(e, i)}
            onDragEnd={onDragEnd}
            className="relative aspect-[2/3] rounded-xl overflow-hidden border-2 border-foreground/20 group cursor-grab active:cursor-grabbing select-none"
          >
            <img
              src={fav.poster}
              alt={fav.title}
              className="w-full h-full object-cover"
              draggable={false}
            />

            {/* Title overlay */}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-2 pt-6">
              <p className="text-[9px] font-bold leading-tight truncate text-white">{fav.title}</p>
              <p className="text-[8px] text-white/50 mt-0.5">{fav.year}</p>
            </div>

            {/* Hover dim */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors pointer-events-none" />

            {/* Hover actions */}
            <div className="absolute top-1.5 right-1.5 z-20 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={e => removeFavorite(i, e)}
                className="p-1 rounded-full bg-black/70 text-white hover:bg-red-500/90"
              >
                <X className="h-3 w-3" />
              </button>
              <button
                onClick={e => { e.preventDefault(); e.stopPropagation(); openSearch(i); }}
                className="p-1 rounded-full bg-black/70 text-white hover:bg-primary/90"
                aria-label={`Swap ${fav.title}`}
              >
                <RefreshCw className="h-3 w-3" />
              </button>
            </div>

            {/* Click navigates to movie */}
            <Link
              href={`/movie/${fav.id}`}
              className="absolute inset-0 z-10"
              aria-label={fav.title}
            />
          </div>
        ))}

        {/* Empty slots */}
        {Array.from({ length: emptySlots }).map((_, i) => (
          <button
            key={`empty-${i}`}
            onClick={() => openSearch()}
            className="relative aspect-[2/3] rounded-xl border-2 border-dashed border-foreground/25 hover:border-foreground/60 flex items-center justify-center transition-colors group"
          >
            <Plus className="h-4 w-4 text-foreground/30 group-hover:text-foreground/70 transition-colors" />
          </button>
        ))}
      </div>

      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="sm:max-w-md rounded-3xl bg-background/95 backdrop-blur-xl border-white/10">
          <DialogHeader>
            <DialogTitle className="font-headline">
              {swapIndex !== null ? 'Replace Favorite' : 'Add to Favorites'}
            </DialogTitle>
          </DialogHeader>

          {favorites.length >= MAX_FAVORITES && swapIndex === null ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              You have reached the maximum of 10 favorites. Remove one to add another.
            </p>
          ) : (
            <div className="space-y-4 pt-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search movies & shows..."
                  className="pl-9 rounded-xl bg-white/5 border-white/10 focus-visible:ring-primary/50"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                {searching && (
                  <p className="text-sm text-muted-foreground text-center py-6">Searching…</p>
                )}
                {!searching && query.trim() && results.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6">No results found</p>
                )}
                {!query.trim() && (
                  <p className="text-sm text-muted-foreground text-center py-6">Type to search movies & shows</p>
                )}
                {results.map(r => (
                  <button
                    key={r.id}
                    onClick={() => addFavorite(r)}
                    className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors text-left"
                  >
                    <img
                      src={r.poster}
                      alt={r.title}
                      className="w-9 h-[54px] object-cover rounded-lg flex-shrink-0 bg-white/5"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{r.title}</p>
                      <p className="text-xs text-muted-foreground">{r.year}</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                      r.type === 'show'
                        ? 'bg-blue-500/20 text-blue-400'
                        : 'bg-primary/20 text-primary'
                    }`}>
                      {r.type === 'show' ? 'TV' : 'Film'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
