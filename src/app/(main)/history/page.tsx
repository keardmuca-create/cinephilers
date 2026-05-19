"use client"

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { History, Eye } from 'lucide-react';
import type { ItemMeta } from '@/app/api/meta/[id]/route';

// ─── Types ────────────────────────────────────────────────────────────────────

type SortOption = 'date' | 'title-asc' | 'title-desc';
type TypeFilter = 'any' | 'movie' | 'tv-series' | 'tv-mini-series' | 'tv-movie' | 'tv-episode' | 'short';

// ─── localStorage helpers ─────────────────────────────────────────────────────

function readAllWatchedIds(): string[] {
  const ids = new Set<string>();
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (
        k.startsWith('watched-') &&
        !k.startsWith('watched-ep-') &&
        localStorage.getItem(k) === 'true'
      ) {
        ids.add(k.slice('watched-'.length));
      }
      if (k.startsWith('watched-ep-')) {
        const m = k.slice('watched-ep-'.length).match(/^(.+)-S\d+E\d+$/);
        if (m) ids.add(m[1]);
      }
    }
  } catch { /* ignore */ }
  return [...ids];
}

function readLoggedAt(id: string, log: { id: string; loggedAt: string }[]): string {
  const entry = log
    .filter(e => e.id === id || e.id.startsWith(id + '-'))
    .sort((a, b) => new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime())[0];
  return entry?.loggedAt ?? new Date(0).toISOString();
}

function readMetaCache(id: string): ItemMeta | null {
  try { return JSON.parse(localStorage.getItem(`meta-${id}`) ?? 'null'); }
  catch { return null; }
}

function writeMetaCache(id: string, m: ItemMeta) {
  try { localStorage.setItem(`meta-${id}`, JSON.stringify(m)); } catch { /* ignore */ }
}

function readUserRating(id: string): number | undefined {
  try {
    const r = localStorage.getItem(`movie-rating-${id}`);
    return r ? Number(r) : undefined;
  } catch { return undefined; }
}

async function fetchAndCacheMeta(id: string): Promise<ItemMeta | null> {
  try {
    const r = await fetch(`/api/meta/${id}`);
    if (!r.ok) return null;
    const m: ItemMeta = await r.json();
    writeMetaCache(id, m);
    return m;
  } catch { return null; }
}

function getItemType(meta: ItemMeta): TypeFilter {
  if (meta.type === 'show') {
    const st = (meta.showType ?? '').toLowerCase();
    if (st === 'miniseries' || st.includes('mini')) return 'tv-mini-series';
    return 'tv-series';
  }
  const genres = meta.genre ?? '';
  if (genres.includes('TV Movie')) return 'tv-movie';
  if (genres.includes('Short')) return 'short';
  return 'movie';
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function HistoryCard({ id, meta, userRating }: {
  id: string;
  meta: ItemMeta | undefined;
  userRating: number | undefined;
}) {
  if (!meta) {
    return (
      <div className="space-y-2.5">
        <div className="aspect-[2/3] bg-white/5 rounded-xl animate-pulse" />
        <div className="h-3.5 bg-white/5 rounded animate-pulse w-3/4" />
        <div className="h-3 bg-white/5 rounded animate-pulse w-1/2" />
      </div>
    );
  }

  return (
    <Link href={`/movie/${id}`} className="group block">
      <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-muted shadow-lg movie-card-hover mb-2.5">
        <img
          src={meta.poster}
          alt={meta.title}
          className="w-full h-full object-cover transition-transform group-hover:scale-110"
          loading="lazy"
        />
        <div className="absolute top-2 right-2">
          <div className="h-7 w-7 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center">
            <Eye className="h-4 w-4 text-blue-400" />
          </div>
        </div>
      </div>
      <div className="space-y-1 px-0.5 mt-2.5">
        <div className="flex items-start justify-between gap-1">
          <h3 className="text-sm font-semibold font-headline line-clamp-2 group-hover:text-primary transition-colors leading-snug flex-1 min-w-0">
            {meta.title}
          </h3>
          <div className="flex flex-col items-end gap-0.5 shrink-0">
            {meta.tmdbRating !== undefined && (
              <div className="flex items-center gap-0.5">
                <span className="text-xs text-yellow-400 font-bold">★</span>
                <span className="text-xs font-bold text-white">{meta.tmdbRating.toFixed(1)}</span>
              </div>
            )}
            {userRating !== undefined && (
              <div className="flex items-center gap-0.5">
                <span className="text-xs text-blue-400 font-bold">★</span>
                <span className="text-xs font-bold text-blue-400">{userRating}</span>
              </div>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{meta.year}</p>
      </div>
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const BATCH = 50;

export default function HistoryPage() {
  const [allIds, setAllIds]           = useState<string[]>([]);
  const [metaMap, setMetaMap]         = useState<Map<string, ItemMeta>>(new Map());
  const [userRatings, setUserRatings] = useState<Map<string, number>>(new Map());
  const [displayCount, setDisplayCount] = useState(BATCH);
  const [fetching, setFetching]       = useState(false);
  const [sort, setSort]               = useState<SortOption>('date');
  const [typeFilter, setTypeFilter]   = useState<TypeFilter>('any');

  const sentinelRef  = useRef<HTMLDivElement>(null);
  const fetchingRef  = useRef(new Set<string>()); // tracks IDs queued/fetched to prevent duplicate requests
  const dateMapRef   = useRef(new Map<string, string>());

  // ─── Initial load ──────────────────────────────────────────────────────────

  useEffect(() => {
    const ids = readAllWatchedIds();

    // Read watch-log for date ordering
    let log: { id: string; loggedAt: string }[] = [];
    try { log = JSON.parse(localStorage.getItem('watch-log') ?? '[]'); } catch { /* ignore */ }
    const dm = new Map<string, string>();
    for (const id of ids) dm.set(id, readLoggedAt(id, log));
    dateMapRef.current = dm;

    // Read cached metadata (instant)
    const mm = new Map<string, ItemMeta>();
    for (const id of ids) {
      const m = readMetaCache(id);
      if (m) { mm.set(id, m); fetchingRef.current.add(id); }
    }

    // Read user ratings
    const ratings = new Map<string, number>();
    for (const id of ids) {
      const r = readUserRating(id);
      if (r !== undefined) ratings.set(id, r);
    }

    // Default sort: date descending
    const sorted = [...ids].sort(
      (a, b) => new Date(dm.get(b) ?? 0).getTime() - new Date(dm.get(a) ?? 0).getTime()
    );

    setMetaMap(mm);
    setUserRatings(ratings);
    setAllIds(sorted);
  }, []);

  // ─── Fetch metadata for visible + next batch ───────────────────────────────

  useEffect(() => {
    if (allIds.length === 0) return;
    const limit = Math.min(allIds.length, displayCount + BATCH);
    const toFetch = allIds.slice(0, limit).filter(id => !fetchingRef.current.has(id));
    if (toFetch.length === 0) return;
    toFetch.forEach(id => fetchingRef.current.add(id));
    setFetching(true);
    Promise.all(toFetch.map(fetchAndCacheMeta)).then(results => {
      setMetaMap(prev => {
        const next = new Map(prev);
        toFetch.forEach((id, i) => { if (results[i]) next.set(id, results[i]!); });
        return next;
      });
      setFetching(false);
    });
  }, [allIds, displayCount]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Infinite scroll ───────────────────────────────────────────────────────

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const obs = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting) setDisplayCount(p => p + BATCH); },
      { rootMargin: '300px' }
    );
    obs.observe(sentinel);
    return () => obs.disconnect();
  }, []);

  // ─── Rating event listener ─────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: Event) => {
      const { id, rating } = (e as CustomEvent<{ id: string; rating: number | null }>).detail;
      setUserRatings(prev => {
        const next = new Map(prev);
        if (rating === null) next.delete(id); else next.set(id, rating);
        return next;
      });
    };
    window.addEventListener('cinephilers-rating-changed', handler);
    return () => window.removeEventListener('cinephilers-rating-changed', handler);
  }, []);

  // ─── Sort + filter ─────────────────────────────────────────────────────────

  const sortedFilteredIds = useMemo(() => {
    let ids = [...allIds];

    // Type filter (hides items with no meta yet when filter is active)
    if (typeFilter !== 'any') {
      ids = ids.filter(id => {
        const meta = metaMap.get(id);
        return meta ? getItemType(meta) === typeFilter : false;
      });
    }

    if (sort === 'title-asc') {
      ids.sort((a, b) => (metaMap.get(a)?.title ?? '').localeCompare(metaMap.get(b)?.title ?? ''));
    } else if (sort === 'title-desc') {
      ids.sort((a, b) => (metaMap.get(b)?.title ?? '').localeCompare(metaMap.get(a)?.title ?? ''));
    }
    // 'date' is already sorted by dateMapRef order in allIds

    return ids;
  }, [allIds, sort, typeFilter, metaMap]);

  const visibleIds = sortedFilteredIds.slice(0, displayCount);
  const hasMore    = displayCount < sortedFilteredIds.length;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <main className="p-6 pt-12 pb-32 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-headline font-bold">Watch History</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {allIds.length} Title{allIds.length !== 1 ? 's' : ''}
          {fetching && <span className="ml-2 opacity-50">loading…</span>}
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <select
          value={sort}
          onChange={e => setSort(e.target.value as SortOption)}
          className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
        >
          <option value="date">Date Added</option>
          <option value="title-asc">Title A–Z</option>
          <option value="title-desc">Title Z–A</option>
        </select>

        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value as TypeFilter)}
          className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
        >
          <option value="any">Any Type</option>
          <option value="movie">Movie</option>
          <option value="tv-series">TV Series</option>
          <option value="tv-mini-series">TV Mini Series</option>
          <option value="tv-movie">TV Movie</option>
          <option value="tv-episode">TV Episode</option>
          <option value="short">Short</option>
        </select>
      </div>

      {/* Grid */}
      {allIds.length === 0 && !fetching ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <History className="h-12 w-12 text-muted-foreground/20" />
          <p className="text-muted-foreground text-sm">Nothing here yet</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4">
            {visibleIds.map(id => (
              <HistoryCard
                key={id}
                id={id}
                meta={metaMap.get(id)}
                userRating={userRatings.get(id)}
              />
            ))}
          </div>

          {/* Infinite scroll sentinel */}
          {hasMore && <div ref={sentinelRef} className="h-4" />}

          {!hasMore && allIds.length > 0 && (
            <p className="text-center text-xs text-muted-foreground py-2">
              All {allIds.length} title{allIds.length !== 1 ? 's' : ''} loaded
            </p>
          )}
        </>
      )}
    </main>
  );
}
