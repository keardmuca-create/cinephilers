"use client"

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, X, Search, Heart, RefreshCw, Film, Crown, Move } from 'lucide-react';
import Link from 'next/link';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { batchFetchMeta } from '@/lib/meta-batch';
import { useAuth } from '@/contexts/auth-context';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';

interface FavoriteItem {
  id: string;
  title: string;
  year: string;
  poster: string;
  type: 'movie' | 'show';
}

const FAVORITES_KEY = 'user-favorites';
const MAX_FAVORITES = 7;

// Ring layout: slot 0 is the hero (centre), slots 1–6 orbit it with a gap so
// the top/bottom posters never touch the hero. Positions are % of a fixed-ratio
// container so the whole thing scales cleanly from phone to desktop.
export const RING = [
  { left: '35%',   top: '32.6%', width: '30%', hero: true },
  { left: '37.5%', top: '0%',    width: '25%' },
  { left: '75%',   top: '14%',   width: '25%' },
  { left: '75%',   top: '57.1%', width: '25%' },
  { left: '37.5%', top: '71.1%', width: '25%' },
  { left: '0%',    top: '57.1%', width: '25%' },
  { left: '0%',    top: '14%',   width: '25%' },
];

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
  // Arrange mode: taps swap posters instead of opening the movie — the only
  // reorder that works on touch (the old HTML5 drag was mouse-only).
  const [arranging, setArranging] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const local = loadFavorites();
    if (local.length > 0) setFavorites(local);

    if (!user) return;
    fetch(`/api/users/${user.username}/favorites`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(async json => {
        const dbItems: { id: string; tmdbId: string; mediaType: string }[] = json?.data ?? [];
        if (dbItems.length === 0) return;
        const localByTmdbId = new Map(local.map(f => [f.id, f]));
        const missingIds = dbItems.filter(db => !localByTmdbId.has(db.tmdbId)).map(db => db.tmdbId);
        const metaMap = missingIds.length > 0 ? await batchFetchMeta(missingIds) : {};
        const merged: FavoriteItem[] = dbItems.map(db => {
          if (localByTmdbId.has(db.tmdbId)) return localByTmdbId.get(db.tmdbId)!;
          const m = metaMap[db.tmdbId];
          return { id: db.tmdbId, title: m?.title ?? '', year: m?.year ?? '', poster: m?.poster ?? '', type: db.mediaType === 'SHOW' ? 'show' as const : 'movie' as const };
        }).slice(0, MAX_FAVORITES);
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
            id: m.id, title: m.title, year: m.year, poster: m.poster, type: m.type,
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

  // The database is the source of truth — /api/sync reloads favourites from it
  // at every sign-in. So a write that quietly failed is not a cosmetic problem:
  // it is a change the person made, saw take effect, and then loses without ever
  // being told. These calls used to be fire-and-forget with the error swallowed,
  // which is exactly that. Now the caller waits for the answer.
  const syncFavoriteDb = async (method: 'POST' | 'DELETE', item: FavoriteItem): Promise<boolean> => {
    const mediaType = item.type === 'show' ? 'SHOW' : 'MOVIE';
    try {
      const res = method === 'POST'
        ? await fetchWithAuth('/api/favorites', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tmdbId: item.id, mediaType }),
          })
        : await fetchWithAuth(`/api/favorites/${item.id}?mediaType=${mediaType}`, { method: 'DELETE' });
      return res.ok;
    } catch {
      return false;
    }
  };

  // Put the list back and say why. A silent rollback would be its own bug: a
  // poster reappearing with no explanation reads as the app ignoring the tap.
  const revertFavorites = (previous: FavoriteItem[], action: string) => {
    updateFavorites(previous);
    toast({
      title: `Couldn't ${action} that favorite`,
      description: 'Your favorites are unchanged. Check your connection and try again.',
      variant: 'destructive',
    });
  };

  // Persist the ring's order. Without this the arrangement lived only on the
  // device that made it, and the next page load rebuilt the list from the
  // database — in the order things were added — throwing it away.
  const saveFavoriteOrder = async (items: FavoriteItem[]): Promise<boolean> => {
    try {
      const res = await fetchWithAuth('/api/favorites', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map(f => ({ tmdbId: f.id, mediaType: f.type === 'show' ? 'SHOW' : 'MOVIE' })),
        }),
      });
      return res.ok;
    } catch {
      return false;
    }
  };

  const addFavorite = async (item: FavoriteItem) => {
    if (favorites.some(f => f.id === item.id)) { setSearchOpen(false); return; }
    const previous = favorites;

    // Swap: replace one favourite with another. The screen still updates first,
    // so it feels instant — but a swap only holds if BOTH halves land. Firing
    // them off and hoping was how a swap could delete the old favourite, fail to
    // add the new one, and leave an empty slot nobody asked for.
    if (swapIndex !== null && swapIndex < favorites.length) {
      const removed = favorites[swapIndex];
      const updated = [...favorites];
      updated[swapIndex] = item;
      updateFavorites(updated);
      setSearchOpen(false);

      const removedOk = removed ? await syncFavoriteDb('DELETE', removed) : true;
      const addedOk = await syncFavoriteDb('POST', item);
      if (removedOk && addedOk) {
        // The new favourite was just created, so it carries a fresh timestamp
        // and would sort to the end — not into the slot it was swapped into.
        // Rewriting the whole order puts it where the person dropped it.
        await saveFavoriteOrder(updated);
        return;
      }

      // Half-applied. Undo the half that DID land, or reverting the screen would
      // leave it disagreeing with the server and the next sync would win.
      if (removedOk && !addedOk && removed) await syncFavoriteDb('POST', removed);
      if (!removedOk && addedOk) await syncFavoriteDb('DELETE', item);
      revertFavorites(previous, 'swap');
      return;
    }

    if (favorites.length >= MAX_FAVORITES) return;
    updateFavorites([...favorites, item]);
    setSearchOpen(false);
    if (!(await syncFavoriteDb('POST', item))) revertFavorites(previous, 'add');
  };

  const removeFavorite = async (index: number) => {
    const removed = favorites[index];
    if (!removed) return;
    const previous = favorites;
    updateFavorites(favorites.filter((_, i) => i !== index));
    setSelected(null);
    if (!(await syncFavoriteDb('DELETE', removed))) revertFavorites(previous, 'remove');
  };

  // Tap a poster in arrange mode: first tap selects, second tap swaps the two.
  const onArrangeTap = async (i: number) => {
    if (selected === null) { setSelected(i); return; }
    if (selected === i) { setSelected(null); return; }
    const previous = favorites;
    const updated = [...favorites];
    [updated[selected], updated[i]] = [updated[i], updated[selected]];
    updateFavorites(updated);
    setSelected(null);
    if (!(await saveFavoriteOrder(updated))) revertFavorites(previous, 'rearrange');
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-2xl font-headline font-bold flex items-center gap-3">
          <Heart className="h-6 w-6 text-primary" /> Favorites
        </h3>
        <div className="flex items-center gap-2">
          {favorites.length >= 2 && (
            <button
              onClick={() => { setArranging(v => !v); setSelected(null); }}
              className={`flex items-center gap-1.5 text-sm border px-3 py-1.5 rounded-full transition-colors ${arranging ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground hover:text-foreground border-border bg-muted hover:bg-muted/80'}`}
            >
              {arranging ? 'Done' : <><Move className="h-3.5 w-3.5" /> Arrange</>}
            </button>
          )}
          {!arranging && favorites.length < MAX_FAVORITES && (
            <button
              onClick={() => openSearch()}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground border border-border bg-muted hover:bg-muted/80 px-3 py-1.5 rounded-full transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          )}
        </div>
      </div>

      {arranging && (
        <p className="text-xs text-muted-foreground mb-3">
          {selected === null ? 'Tap a poster, then tap another to swap them. The centre is your #1.' : 'Now tap where you want it.'}
        </p>
      )}

      {/* Ring: hero in the centre, 6 orbiting with a gap */}
      <div className="relative w-full max-w-[380px] mx-auto" style={{ aspectRatio: '202 / 262' }}>
        {RING.map((pos, i) => {
          const fav = favorites[i];
          const isSelected = selected === i;

          const posterInner = fav && (
            <div className={`relative w-full aspect-[2/3] rounded-xl overflow-hidden border-2 transition-all ${pos.hero ? 'border-primary shadow-lg' : 'border-foreground/20'} ${isSelected ? 'ring-2 ring-primary ring-offset-2 ring-offset-background scale-95' : ''}`}>
              {fav.poster ? (
                <img src={fav.poster} alt={fav.title} className="w-full h-full object-cover" draggable={false} />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-muted">
                  <Film className={`${pos.hero ? 'h-8 w-8' : 'h-6 w-6'} text-primary/60`} />
                </div>
              )}
              {pos.hero && (
                <div className="absolute top-1 left-1 bg-primary text-primary-foreground rounded-full h-5 w-5 flex items-center justify-center shadow">
                  <Crown className="h-3 w-3" />
                </div>
              )}
            </div>
          );

          return (
            <div key={i} className="absolute" style={{ left: pos.left, top: pos.top, width: pos.width }}>
              {!fav ? (
                <button
                  onClick={() => openSearch()}
                  className="w-full aspect-[2/3] rounded-xl border-2 border-dashed border-foreground/25 hover:border-foreground/60 flex items-center justify-center transition-colors group"
                  aria-label="Add favorite"
                >
                  <Plus className={`${pos.hero ? 'h-5 w-5' : 'h-4 w-4'} text-foreground/30 group-hover:text-foreground/70 transition-colors`} />
                </button>
              ) : arranging ? (
                <div className="relative">
                  <button onClick={() => onArrangeTap(i)} className="w-full block" aria-label={`Move ${fav.title}`}>
                    {posterInner}
                  </button>
                  <div className="absolute -top-1.5 -right-1.5 z-20 flex flex-col gap-1">
                    <button onClick={() => removeFavorite(i)} className="p-1 rounded-full bg-black/80 text-white hover:bg-red-500/90 shadow" aria-label={`Remove ${fav.title}`}>
                      <X className="h-3 w-3" />
                    </button>
                    <button onClick={() => openSearch(i)} className="p-1 rounded-full bg-black/80 text-white hover:bg-primary/90 shadow" aria-label={`Replace ${fav.title}`}>
                      <RefreshCw className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ) : (
                <Link href={`/movie/${fav.id}`} aria-label={fav.title} className="block group">
                  {posterInner}
                </Link>
              )}
            </div>
          );
        })}
      </div>

      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="sm:max-w-md rounded-3xl bg-background/95 backdrop-blur-xl border-border">
          <DialogHeader>
            <DialogTitle className="font-headline">
              {swapIndex !== null ? 'Replace Favorite' : 'Add to Favorites'}
            </DialogTitle>
          </DialogHeader>

          {favorites.length >= MAX_FAVORITES && swapIndex === null ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              You have reached the maximum of {MAX_FAVORITES} favorites. Remove one to add another.
            </p>
          ) : (
            <div className="space-y-4 pt-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search movies & shows..."
                  className="pl-9 rounded-xl bg-muted border-border focus-visible:ring-primary/50"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                {searching && <p className="text-sm text-muted-foreground text-center py-6">Searching…</p>}
                {!searching && query.trim() && results.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6">No results found</p>
                )}
                {!query.trim() && <p className="text-sm text-muted-foreground text-center py-6">Type to search movies & shows</p>}
                {results.map(r => (
                  <button
                    key={r.id}
                    onClick={() => addFavorite(r)}
                    className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-muted/50 transition-colors text-left"
                  >
                    {r.poster ? (
                      <img src={r.poster} alt={r.title} className="w-9 h-[54px] object-cover rounded-lg flex-shrink-0 bg-muted" />
                    ) : (
                      <div className="w-9 h-[54px] rounded-lg flex-shrink-0 bg-muted flex items-center justify-center">
                        <Film className="h-4 w-4 text-primary/60" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{r.title}</p>
                      <p className="text-xs text-muted-foreground">{r.year}</p>
                    </div>
                    {/* One colour for both, because the chip already says which
                        it is. TV used to be blue purely to contrast with Film's
                        crimson — a second brand colour doing a job the word was
                        already doing, and the last blue left in the app. */}
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 bg-primary/20 text-primary">
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
