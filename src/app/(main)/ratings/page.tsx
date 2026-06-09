"use client"

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Star, ChevronLeft, Search, SlidersHorizontal, Check, X } from 'lucide-react';

type SortOption = 'rating-desc' | 'rating-asc' | 'title-asc' | 'title-desc';

const SORT_LABELS: Record<SortOption, string> = {
  'rating-desc': 'Rating: High to Low',
  'rating-asc':  'Rating: Low to High',
  'title-asc':   'Title A–Z',
  'title-desc':  'Title Z–A',
};

interface RatedItem {
  id: string;
  title: string;
  poster: string;
  year: string;
  tmdbRating?: number;
  userRating: number;
}

function readMetaCache(id: string) {
  try { return JSON.parse(localStorage.getItem(`meta-${id}`) ?? 'null'); } catch { return null; }
}

async function fetchMeta(id: string) {
  try {
    const r = await fetch(`/api/meta/${id}`);
    if (!r.ok) return null;
    const m = await r.json();
    try { localStorage.setItem(`meta-${id}`, JSON.stringify(m)); } catch { /* ignore */ }
    return m;
  } catch { return null; }
}

function ItemCard({ item }: { item: RatedItem }) {
  return (
    <Link href={`/movie/${item.id}`} className="group flex items-center gap-4 py-3.5">
      <div className="relative w-16 aspect-[2/3] overflow-hidden rounded-lg bg-muted shadow-md shrink-0">
        <img src={item.poster} alt={item.title} className="w-full h-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold font-headline line-clamp-2 group-hover:text-primary transition-colors leading-snug mb-0.5">
          {item.title}
        </h3>
        <p className="text-xs text-muted-foreground mb-1.5">{item.year}</p>
        <div className="flex items-center gap-2.5 flex-wrap">
          {item.tmdbRating !== undefined && (
            <div className="flex items-center gap-0.5">
              <span className="text-xs text-yellow-400 font-bold">★</span>
              <span className="text-xs font-bold text-foreground">{item.tmdbRating.toFixed(1)}</span>
            </div>
          )}
          <div className="flex items-center gap-0.5">
            <Star className="h-3 w-3 fill-blue-400 text-blue-400" />
            <span className="text-xs font-bold text-blue-400">{item.userRating}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function RatingsPage() {
  const router = useRouter();
  const [items, setItems]           = useState<RatedItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [sort, setSort]             = useState<SortOption>('rating-desc');
  const [search, setSearch]         = useState('');
  const [refineOpen, setRefineOpen] = useState(false);
  const [pendingSort, setPendingSort] = useState<SortOption>('rating-desc');
  const [yearFrom, setYearFrom] = useState('');
  const [yearTo, setYearTo]     = useState('');
  const [pendingYearFrom, setPendingYearFrom] = useState('');
  const [pendingYearTo, setPendingYearTo]     = useState('');
  const fetchingRef = useRef(new Set<string>());

  useEffect(() => {
    const load = async () => {
      const rvMap = new Map<string, { title: string; poster: string; year: string; tmdbRating?: number }>();
      try {
        const stored = localStorage.getItem('recently-viewed');
        if (stored) {
          const rv = JSON.parse(stored) as { id: string; title: string; poster: string; year: string; rating?: number }[];
          for (const item of rv) rvMap.set(item.id, { title: item.title, poster: item.poster, year: item.year, tmdbRating: item.rating });
        }
      } catch { /* ignore */ }

      const initial: RatedItem[] = [];
      const toFetch: string[] = [];

      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)!;
        if (!k.startsWith('movie-rating-')) continue;
        const userRating = Number(localStorage.getItem(k));
        if (!userRating) continue;
        const id = k.slice('movie-rating-'.length);
        const meta = readMetaCache(id);
        const rv   = rvMap.get(id);
        if (meta?.title || rv?.title) {
          initial.push({ id, title: meta?.title ?? rv?.title ?? '', poster: meta?.poster ?? rv?.poster ?? '', year: meta?.year ?? rv?.year ?? '', tmdbRating: meta?.tmdbRating ?? rv?.tmdbRating, userRating });
        } else {
          toFetch.push(id);
          initial.push({ id, title: '', poster: '', year: '', userRating });
        }
      }

      setItems(initial);

      if (toFetch.length > 0) {
        toFetch.forEach(id => fetchingRef.current.add(id));
        const results = await Promise.allSettled(toFetch.map(fetchMeta));
        setItems(prev => {
          const next = [...prev];
          toFetch.forEach((id, i) => {
            const r = results[i];
            if (r.status === 'fulfilled' && r.value?.title) {
              const idx = next.findIndex(x => x.id === id);
              if (idx !== -1) next[idx] = { ...next[idx], title: r.value.title, poster: r.value.poster ?? '', year: r.value.year ?? '', tmdbRating: r.value.tmdbRating };
            }
          });
          return next;
        });
      }

      setLoading(false);
    };
    load();
  }, []);

  const sortedFiltered = useMemo(() => {
    let result = items.filter(i => i.title);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(i => i.title.toLowerCase().includes(q));
    }
    const yFrom = yearFrom ? parseInt(yearFrom, 10) : null;
    const yTo   = yearTo   ? parseInt(yearTo,   10) : null;
    if (yFrom) result = result.filter(i => parseInt(i.year, 10) >= yFrom);
    if (yTo)   result = result.filter(i => parseInt(i.year, 10) <= yTo);
    if (sort === 'title-asc')        result.sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === 'title-desc')  result.sort((a, b) => b.title.localeCompare(a.title));
    else if (sort === 'rating-desc') result.sort((a, b) => b.userRating - a.userRating);
    else if (sort === 'rating-asc')  result.sort((a, b) => a.userRating - b.userRating);
    return result;
  }, [items, sort, search, yearFrom, yearTo]);

  return (
    <main className="pb-32">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-xl border-b border-border px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="rounded-full p-1 hover:bg-muted/60 transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-headline font-bold truncate flex-1">Ratings</h1>
      </div>

      {/* Search */}
      <div className="px-6 pt-4 pb-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input type="text" placeholder="Search ratings" value={search} onChange={e => setSearch(e.target.value)}
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
          {(yearFrom || yearTo) && ` · ${yearFrom || '…'}–${yearTo || '…'}`}
        </p>
        <button onClick={() => { setPendingSort(sort); setPendingYearFrom(yearFrom); setPendingYearTo(yearTo); setRefineOpen(true); }}
          className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:opacity-80 transition-opacity">
          <SlidersHorizontal className="h-3.5 w-3.5" /> Refine
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="px-6 divide-y divide-white/[0.06]">
          {Array(6).fill(0).map((_, i) => (
            <div key={i} className="flex gap-4 py-3.5">
              <div className="w-16 aspect-[2/3] bg-muted rounded-lg animate-pulse shrink-0" />
              <div className="flex-1 space-y-2 py-1">
                <div className="h-4 bg-muted rounded animate-pulse w-2/3" />
                <div className="h-3 bg-muted rounded animate-pulse w-1/3" />
                <div className="h-3 bg-muted rounded animate-pulse w-1/4" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center px-6">
          <Star className="h-12 w-12 text-muted-foreground/20" />
          <p className="text-muted-foreground text-sm">Rate movies to see them here</p>
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
              <button onClick={() => { setSort(pendingSort); setYearFrom(pendingYearFrom); setYearTo(pendingYearTo); setRefineOpen(false); }} className="text-sm font-bold text-primary hover:opacity-80 transition-opacity">Refine</button>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold text-gray-900">Sort By</span>
                <span className="text-sm text-gray-500">{SORT_LABELS[pendingSort]}</span>
              </div>
              <div className="space-y-1">
                {(['rating-desc', 'rating-asc', 'title-asc', 'title-desc'] as SortOption[]).map(s => (
                  <button key={s} onClick={() => setPendingSort(s)} className="w-full flex items-center justify-between py-2.5 text-sm">
                    <span className={pendingSort === s ? 'font-semibold text-gray-900' : 'text-gray-500'}>{SORT_LABELS[s]}</span>
                    {pendingSort === s && <Check className="h-4 w-4 text-primary" />}
                  </button>
                ))}
              </div>
              <div className="mt-5">
                <p className="text-sm font-bold text-gray-900 mb-3">Release Year</p>
                <div className="flex items-center gap-2">
                  <input type="number" placeholder="From" min="1900" max="2099" value={pendingYearFrom} onChange={e => setPendingYearFrom(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-primary" />
                  <span className="text-gray-400 shrink-0">–</span>
                  <input type="number" placeholder="To" min="1900" max="2099" value={pendingYearTo} onChange={e => setPendingYearTo(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-primary" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
