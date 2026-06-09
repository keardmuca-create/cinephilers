"use client"

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bookmark, ChevronLeft, Search, SlidersHorizontal, Check, X } from 'lucide-react';

type SortOption = 'title-asc' | 'title-desc';

const SORT_LABELS: Record<SortOption, string> = {
  'title-asc':  'Title A–Z',
  'title-desc': 'Title Z–A',
};

interface WatchlistItem {
  id: string;
  title: string;
  poster: string;
  year: string;
  tmdbRating?: number;
}

function ItemCard({ item }: { item: WatchlistItem }) {
  return (
    <Link href={`/movie/${item.id}`} className="group flex items-center gap-4 py-3.5">
      <div className="relative w-16 aspect-[2/3] overflow-hidden rounded-lg bg-muted shadow-md shrink-0">
        {item.poster ? (
          <img src={item.poster} alt={item.title} className="w-full h-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-gradient-to-b from-muted to-muted/60 p-1">
            <span className="text-2xl">🎬</span>
            <p className="text-[8px] text-muted-foreground/60 font-medium text-center line-clamp-2 leading-tight">{item.title}</p>
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold font-headline line-clamp-2 group-hover:text-primary transition-colors leading-snug mb-0.5">
          {item.title}
        </h3>
        <p className="text-xs text-muted-foreground mb-1.5">{item.year}</p>
        {item.tmdbRating !== undefined && (
          <div className="flex items-center gap-0.5">
            <span className="text-xs text-yellow-400 font-bold">★</span>
            <span className="text-xs font-bold text-foreground">{item.tmdbRating.toFixed(1)}</span>
          </div>
        )}
      </div>
    </Link>
  );
}

export default function WatchlistPage() {
  const router = useRouter();
  const [items, setItems]           = useState<WatchlistItem[]>([]);
  const [sort, setSort]             = useState<SortOption>('title-asc');
  const [search, setSearch]         = useState('');
  const [refineOpen, setRefineOpen] = useState(false);
  const [pendingSort, setPendingSort] = useState<SortOption>('title-asc');

  useEffect(() => {
    const loaded: WatchlistItem[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)!;
        if (!k.startsWith('watchlist-')) continue;
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        let meta: Record<string, unknown>;
        try { meta = JSON.parse(raw); } catch { continue; }
        if (!meta.title) continue;
        loaded.push({
          id: k.slice('watchlist-'.length),
          title: meta.title as string,
          poster: (meta.poster as string) ?? '',
          year:   (meta.year as string) ?? '',
          tmdbRating: typeof meta.tmdbRating === 'number' ? meta.tmdbRating : undefined,
        });
      }
    } catch { /* ignore */ }
    setItems(loaded);
  }, []);

  const sortedFiltered = useMemo(() => {
    let result = [...items];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(i => i.title.toLowerCase().includes(q));
    }
    if (sort === 'title-asc')  result.sort((a, b) => a.title.localeCompare(b.title));
    else                       result.sort((a, b) => b.title.localeCompare(a.title));
    return result;
  }, [items, sort, search]);

  return (
    <main className="pb-32">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-xl border-b border-border px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="rounded-full p-1 hover:bg-muted/60 transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-headline font-bold truncate flex-1">Watchlist</h1>
      </div>

      {/* Search */}
      <div className="px-6 pt-4 pb-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input type="text" placeholder="Search watchlist" value={search} onChange={e => setSearch(e.target.value)}
            className="w-full bg-white/5 border-2 border-primary/80 rounded-2xl pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors" />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Sort bar */}
      <div className="px-6 pb-4 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {sortedFiltered.length} title{sortedFiltered.length !== 1 ? 's' : ''} · Sorted by {SORT_LABELS[sort]}
        </p>
        <button onClick={() => { setPendingSort(sort); setRefineOpen(true); }}
          className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:opacity-80 transition-opacity">
          <SlidersHorizontal className="h-3.5 w-3.5" /> Refine
        </button>
      </div>

      {/* List */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center px-6">
          <Bookmark className="h-12 w-12 text-muted-foreground/20" />
          <p className="text-muted-foreground text-sm">Save movies to watch later</p>
        </div>
      ) : (
        <div className="px-6 divide-y divide-white/[0.06]">
          {sortedFiltered.map(item => <ItemCard key={item.id} item={item} />)}
        </div>
      )}

      {/* Refine modal */}
      {refineOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setRefineOpen(false)} />
          <div className="relative bg-white rounded-3xl w-full max-w-sm max-h-[75vh] flex flex-col overflow-hidden shadow-2xl border border-gray-200">
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 shrink-0">
              <button onClick={() => setRefineOpen(false)} className="text-sm text-gray-500 hover:text-gray-800 transition-colors">Cancel</button>
              <span className="text-sm font-bold text-gray-900">{items.length} Titles</span>
              <button onClick={() => { setSort(pendingSort); setRefineOpen(false); }} className="text-sm font-bold text-primary hover:opacity-80 transition-opacity">Refine</button>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold text-gray-900">Sort By</span>
                <span className="text-sm text-gray-500">{SORT_LABELS[pendingSort]}</span>
              </div>
              <div className="space-y-1">
                {(['title-asc', 'title-desc'] as SortOption[]).map(s => (
                  <button key={s} onClick={() => setPendingSort(s)} className="w-full flex items-center justify-between py-2.5 text-sm">
                    <span className={pendingSort === s ? 'font-semibold text-gray-900' : 'text-gray-500'}>{SORT_LABELS[s]}</span>
                    {pendingSort === s && <Check className="h-4 w-4 text-primary" />}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
