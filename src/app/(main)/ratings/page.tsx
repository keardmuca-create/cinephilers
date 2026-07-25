"use client"

import React, { useState, useEffect, useRef, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Star, ChevronLeft, Search, SlidersHorizontal, X, Film, Eye } from 'lucide-react';
import { normalizeLocalMediaIds, getAddedAt } from '@/lib/media-id';
import { persistRefine } from '@/lib/refine-sort';
import { batchFetchMeta } from '@/lib/meta-batch';
import { getItemType, TYPE_LABELS, TYPE_ORDER, type TypeFilter } from '@/lib/media-type';
import { RefineSheet, type RefineValue, type SortOption, type CountOption } from '@/components/refine-sheet';

const SORT_OPTIONS: SortOption[] = [
  { value: 'rating',  label: 'Your rating' },
  { value: 'recent',  label: 'Date rated' },
  { value: 'release', label: 'Release date' },
  { value: 'title',   label: 'Title' },
];

const DEFAULT_REFINE: RefineValue = { sortField: 'recent', sortDir: 'desc', type: 'any', genre: 'any' };

interface RatedItem {
  id: string;
  title: string;
  poster: string;
  year: string;
  releaseDate?: string;  // full date, for precise release-date sorting
  tmdbRating?: number;
  userRating: number;
  kind: TypeFilter;      // for the Type filter
  genre: string;         // comma-joined genres, for the Genre filter
}

function readMetaCache(id: string) {
  try { return JSON.parse(localStorage.getItem(`meta-${id}`) ?? 'null'); } catch { return null; }
}


function ItemCard({ item }: { item: RatedItem }) {
  return (
    <Link href={`/movie/${item.id}`} className="group flex items-center gap-4 py-3.5">
      <div className="relative w-16 aspect-[2/3] overflow-hidden rounded-lg bg-muted shadow-md shrink-0">
        {item.poster ? (
          <img src={item.poster} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted">
            <Film className="h-7 w-7 text-primary/60" />
          </div>
        )}
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
          <div className="flex items-center gap-1 text-blue-400">
            <Eye className="h-3.5 w-3.5" />
            <span className="text-xs font-semibold">Watched</span>
          </div>
        </div>
        {/* Same timestamp the "Date rated" sort uses, so the order is legible */}
        {(() => {
          const t = getAddedAt(item.id);
          return t > 0 ? (
            <p className="text-xs text-muted-foreground mt-1.5">
              Rated on {new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          ) : null;
        })()}
      </div>
    </Link>
  );
}

function RatingsPageInner() {
  const router = useRouter();
  const [items, setItems]           = useState<RatedItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [refineOpen, setRefineOpen] = useState(false);
  // Server-safe default; saved refine restored from localStorage after mount.
  const [refine, setRefine]         = useState<RefineValue>(DEFAULT_REFINE);
  const searchParams = useSearchParams();
  const [ratingFilter, setRatingFilter] = useState<number | null>(null);
  const fetchingRef = useRef(new Set<string>());

  useEffect(() => {
    const readRefine = () => {
      try {
        const saved = localStorage.getItem('ratings-refine');
        if (saved) setRefine({ ...DEFAULT_REFINE, ...JSON.parse(saved) });
      } catch { /* ignore */ }
    };
    readRefine();
    // Re-read after login sync restores the account's saved sort into localStorage.
    window.addEventListener('cinephilers-db-restored', readRefine);
    return () => window.removeEventListener('cinephilers-db-restored', readRefine);
  }, []);

  // Read the ?rating=N param reactively. The page doesn't remount when only the
  // query changes (same route segment), so a useState initializer would go stale.
  useEffect(() => {
    const v = searchParams.get('rating');
    const n = v ? parseInt(v, 10) : NaN;
    setRatingFilter(Number.isFinite(n) && n >= 1 && n <= 10 ? n : null);
  }, [searchParams]);

  useEffect(() => {
    const load = async () => {
      normalizeLocalMediaIds();
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
          initial.push({ id, title: meta?.title ?? rv?.title ?? '', poster: meta?.poster ?? rv?.poster ?? '', year: meta?.year ?? rv?.year ?? '', releaseDate: meta?.releaseDate, tmdbRating: meta?.tmdbRating ?? rv?.tmdbRating, userRating, kind: getItemType(meta ?? {}), genre: meta?.genre ?? '' });
        } else {
          toFetch.push(id);
          initial.push({ id, title: '', poster: '', year: '', userRating, kind: 'movie', genre: '' });
        }
      }

      setItems(initial);

      if (toFetch.length > 0) {
        toFetch.forEach(id => fetchingRef.current.add(id));
        const metaMap = await batchFetchMeta(toFetch);
        setItems(prev => {
          const next = [...prev];
          for (const [id, m] of Object.entries(metaMap)) {
            if (!m?.title) continue;
            const idx = next.findIndex(x => x.id === id);
            if (idx !== -1) next[idx] = { ...next[idx], title: m.title, poster: m.poster ?? '', year: m.year ?? '', releaseDate: m.releaseDate, tmdbRating: m.tmdbRating, kind: getItemType(m), genre: m.genre ?? '' };
          }
          return next;
        });
      }

      setLoading(false);
    };
    load();
    // Re-load once the login sync finishes writing DB ratings into localStorage
    const handler = () => { load(); };
    window.addEventListener('cinephilers-db-restored', handler);
    return () => window.removeEventListener('cinephilers-db-restored', handler);
  }, []);

  // Options for the Type / Genre filters, computed from the rated items.
  const typeOptions = useMemo<CountOption[]>(() => {
    const withTitle = items.filter(i => i.title);
    if (withTitle.length === 0) return [];
    const counts = new Map<TypeFilter, number>();
    for (const it of withTitle) counts.set(it.kind, (counts.get(it.kind) ?? 0) + 1);
    // Always list every type (TV Series, TV Episode, TV Movie, Short, …) rather
    // than only the ones already rated — the full set makes it obvious what can
    // be filtered, and counts show which are empty.
    return [
      { value: 'any', label: 'Any', count: withTitle.length },
      ...TYPE_ORDER.filter(t => t !== 'any').map(t => ({ value: t, label: TYPE_LABELS[t], count: counts.get(t) ?? 0 })),
    ];
  }, [items]);

  const genreOptions = useMemo<CountOption[]>(() => {
    const withTitle = items.filter(i => i.title);
    const counts = new Map<string, number>();
    for (const it of withTitle) {
      for (const g of it.genre.split(',').map(s => s.trim()).filter(Boolean)) counts.set(g, (counts.get(g) ?? 0) + 1);
    }
    const entries = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (entries.length === 0) return [];
    return [
      { value: 'any', label: 'Any', count: withTitle.length },
      ...entries.map(([g, c]) => ({ value: g, label: g, count: c })),
    ];
  }, [items]);

  const sortedFiltered = useMemo(() => {
    let result = items.filter(i => i.title);
    if (ratingFilter !== null)  result = result.filter(i => i.userRating === ratingFilter);
    if (refine.type !== 'any')  result = result.filter(i => i.kind === refine.type);
    if (refine.genre !== 'any') result = result.filter(i => i.genre.split(',').map(s => s.trim()).includes(refine.genre));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(i => i.title.toLowerCase().includes(q));
    }

    if (refine.sortField === 'rating') {
      // Title tie-break: same-score items would otherwise reshuffle across
      // login syncs (localStorage rebuild order is arbitrary).
      result.sort((a, b) => (b.userRating - a.userRating) || a.title.localeCompare(b.title));
      if (refine.sortDir === 'asc') result.reverse();
    } else if (refine.sortField === 'title') {
      result.sort((a, b) => a.title.localeCompare(b.title));
      if (refine.sortDir === 'desc') result.reverse();
    } else if (refine.sortField === 'release') {
      const ts = (it: RatedItem): number | null => {
        const raw = it.releaseDate || (/^\d{4}$/.test(it.year) ? `${it.year}-01-01` : '');
        const t = raw ? Date.parse(raw) : NaN;
        return Number.isNaN(t) ? null : t;
      };
      const dir = refine.sortDir === 'desc' ? -1 : 1;
      result.sort((a, b) => {
        const ta = ts(a), tb = ts(b);
        if (ta === null && tb === null) return 0;
        if (ta === null) return 1;
        if (tb === null) return -1;
        return (ta - tb) * dir;
      });
    } else {
      // Date rated — title tie-break keeps bulk-imported same-date items stable
      result.sort((a, b) => (getAddedAt(b.id) - getAddedAt(a.id)) || a.title.localeCompare(b.title));
      if (refine.sortDir === 'asc') result.reverse();
    }
    return result;
  }, [items, refine, search, ratingFilter]);

  return (
    <main className="pb-32">
      {/* Header */}
      <div className="sticky top-[env(safe-area-inset-top)] z-10 bg-background/90 backdrop-blur-xl border-b border-border px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="rounded-full p-1 hover:bg-muted/60 transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-headline font-bold truncate flex-1">Ratings</h1>
        {ratingFilter !== null && (
          <button
            onClick={() => { setRatingFilter(null); router.replace('/ratings'); }}
            className="flex items-center gap-1.5 text-xs font-bold text-blue-400 bg-blue-400/10 border border-blue-400/30 rounded-full px-3 py-1.5 hover:bg-blue-400/20 transition-colors"
          >
            ★ Rated {ratingFilter}/10 <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Search */}
      <div className="px-6 pt-4 pb-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input type="text" placeholder="Search ratings" value={search} onChange={e => setSearch(e.target.value)}
            className="w-full bg-muted border-2 border-primary/80 rounded-2xl pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors" />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Sort bar */}
      <div className="px-6 pb-4 flex items-center justify-between">
        <p className="text-xs text-muted-foreground truncate">
          {sortedFiltered.length} title{sortedFiltered.length !== 1 ? 's' : ''} · {SORT_OPTIONS.find(s => s.value === refine.sortField)?.label}
          {refine.type !== 'any' && ` · ${TYPE_LABELS[refine.type as TypeFilter]}`}
          {refine.genre !== 'any' && ` · ${refine.genre}`}
        </p>
        <button onClick={() => setRefineOpen(true)}
          className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:opacity-80 transition-opacity shrink-0">
          <SlidersHorizontal className="h-3.5 w-3.5" /> Refine
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="px-6 divide-y divide-border">
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
        <div className="px-6 divide-y divide-border">
          {sortedFiltered.map(item => <ItemCard key={item.id} item={item} />)}
        </div>
      )}

      <RefineSheet
        open={refineOpen}
        onClose={() => setRefineOpen(false)}
        total={items.filter(i => i.title).length}
        sortOptions={SORT_OPTIONS}
        typeOptions={typeOptions}
        genreOptions={genreOptions}
        value={refine}
        onApply={v => {
          setRefine(v);
          persistRefine('ratings-refine', v);
        }}
      />
    </main>
  );
}

export default function RatingsPage() {
  return (
    <Suspense fallback={null}>
      <RatingsPageInner />
    </Suspense>
  );
}
