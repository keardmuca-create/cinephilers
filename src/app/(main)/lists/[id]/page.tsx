"use client"

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Search, X, Film, Lock, Globe, SlidersHorizontal, Check, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { useAuth } from '@/contexts/auth-context';

interface ListItem {
  movieId: string;
  title: string;
  poster: string;
  year: string;
  type: 'movie' | 'show';
  tmdbId?: string;
}

interface CustomList {
  id: string;
  title: string;
  name?: string;
  isPrivate: boolean;
  isPublic?: boolean;
  description?: string | null;
  items: ListItem[];
}

type SortOption = 'added-desc' | 'added-asc' | 'title-asc' | 'title-desc' | 'release-desc' | 'release-asc';
type TypeFilter = 'any' | 'movie' | 'show';

const SORT_LABELS: Record<SortOption, string> = {
  'added-desc': 'Date added (newest)',
  'added-asc': 'Date added (oldest)',
  'title-asc': 'Title (A–Z)',
  'title-desc': 'Title (Z–A)',
  'release-desc': 'Release year (newest)',
  'release-asc': 'Release year (oldest)',
};

const TYPE_LABELS: Record<TypeFilter, string> = {
  any: 'All types',
  movie: 'Movies',
  show: 'TV & Shows',
};

function normalise(list: CustomList): { id: string; name: string; isPrivate: boolean; description: string | null; items: ListItem[] } {
  return {
    id: list.id,
    name: list.title ?? list.name ?? '',
    isPrivate: list.isPrivate ?? !list.isPublic,
    description: list.description ?? null,
    items: list.items,
  };
}

export default function ListDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [list, setList] = useState<ReturnType<typeof normalise> | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Refine state
  const [sort, setSort] = useState<SortOption>('added-desc');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('any');
  const [refineOpen, setRefineOpen] = useState(false);
  const [pendingSort, setPendingSort] = useState<SortOption>('added-desc');
  const [pendingType, setPendingType] = useState<TypeFilter>('any');

  useEffect(() => {
    // Try localStorage first for instant load
    try {
      const stored: CustomList[] = JSON.parse(localStorage.getItem('user-lists') ?? '[]');
      const found = stored.find(l => l.id === id);
      if (found) setList(normalise(found));
    } catch { /* ignore */ }

    fetchWithAuth(`/api/lists/${id}`)
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (!json?.data) return;
        const d = json.data;
        setOwnerId(d.userId ?? null);
        setList({
          id: d.id,
          name: d.name,
          isPrivate: !d.isPublic,
          description: d.description ?? null,
          items: (d.items ?? []).map((i: { tmdbId: string; title: string | null; poster: string | null; year: string | null; mediaType: string }) => ({
            movieId: i.tmdbId,
            title: i.title ?? '',
            poster: i.poster ?? '',
            year: i.year ?? '',
            type: i.mediaType === 'SHOW' ? 'show' : 'movie',
          })),
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const isOwner = !!user && !!ownerId && user.id === ownerId;

  const typeCounts = useMemo(() => {
    const items = list?.items ?? [];
    return {
      any: items.length,
      movie: items.filter(i => i.type === 'movie').length,
      show: items.filter(i => i.type === 'show').length,
    };
  }, [list]);

  const filtered = useMemo(() => {
    if (!list) return [];
    // Keep original (date-added) order as the API returns newest-first.
    let items = list.items.map((item, originalIndex) => ({ ...item, originalIndex }));

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      items = items.filter(i => i.title.toLowerCase().includes(q));
    }
    if (typeFilter !== 'any') {
      items = items.filter(i => i.type === typeFilter);
    }

    if (sort === 'title-asc') {
      items.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sort === 'title-desc') {
      items.sort((a, b) => b.title.localeCompare(a.title));
    } else if (sort === 'release-desc') {
      items.sort((a, b) => parseInt(b.year || '0', 10) - parseInt(a.year || '0', 10));
    } else if (sort === 'release-asc') {
      items.sort((a, b) => parseInt(a.year || '9999', 10) - parseInt(b.year || '9999', 10));
    } else if (sort === 'added-asc') {
      items.sort((a, b) => b.originalIndex - a.originalIndex);
    } else {
      // added-desc: API already returns newest-first
      items.sort((a, b) => a.originalIndex - b.originalIndex);
    }

    return items;
  }, [list, search, sort, typeFilter]);

  const openRefine = () => {
    setPendingSort(sort);
    setPendingType(typeFilter);
    setRefineOpen(true);
  };

  const applyRefine = () => {
    setSort(pendingSort);
    setTypeFilter(pendingType);
    setRefineOpen(false);
  };

  const removeItem = async (item: ListItem & { originalIndex?: number }) => {
    if (!list || removingId) return;
    setRemovingId(item.movieId);
    const mediaType = item.type === 'show' ? 'SHOW' : 'MOVIE';

    // Optimistically update UI
    setList(prev => prev ? { ...prev, items: prev.items.filter(i => i.movieId !== item.movieId) } : prev);

    // Keep localStorage in sync
    try {
      const stored: CustomList[] = JSON.parse(localStorage.getItem('user-lists') ?? '[]');
      const next = stored.map(l =>
        l.id === id ? { ...l, items: (l.items ?? []).filter(i => i.movieId !== item.movieId) } : l
      );
      localStorage.setItem('user-lists', JSON.stringify(next));
    } catch { /* ignore */ }

    try {
      await fetchWithAuth(`/api/lists/${id}/items/${item.movieId}?mediaType=${mediaType}`, { method: 'DELETE' });
    } catch { /* ignore — UI already updated, DB cleanup is best-effort */ }
    setRemovingId(null);
  };

  return (
    <main className="max-w-xl mx-auto pb-32">
      {/* Header */}
      <div className="sticky top-[env(safe-area-inset-top)] z-10 bg-background/90 backdrop-blur-xl border-b border-border px-4 py-4 flex items-center gap-3">
        <Button variant="ghost" size="icon" className="rounded-full shrink-0" onClick={() => router.back()}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-headline font-bold truncate">{list?.name ?? 'List'}</h1>
          {list && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {list.isPrivate
                ? <><Lock className="h-3 w-3" />Private</>
                : <><Globe className="h-3 w-3" />Public</>
              }
              <span>·</span>
              <span>{list.items.length} title{list.items.length !== 1 ? 's' : ''}</span>
            </div>
          )}
        </div>
      </div>

      <div className="px-4 pt-4 space-y-3">
        {/* Description */}
        {list?.description && (
          <p className="text-sm text-muted-foreground leading-relaxed">{list.description}</p>
        )}

        {/* Search */}
        {list && list.items.length > 4 && (
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search this list"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-muted border-2 border-primary/80 rounded-2xl pl-10 pr-10 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        {/* Sorted by + Refine button */}
        {list && list.items.length > 0 && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {filtered.length} title{filtered.length !== 1 ? 's' : ''} · {SORT_LABELS[sort]}
              {typeFilter !== 'any' && ` · ${TYPE_LABELS[typeFilter]}`}
            </p>
            <button
              onClick={openRefine}
              className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:opacity-80 transition-opacity"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Refine
            </button>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && !list && (
          <div className="divide-y divide-border">
            {Array(6).fill(0).map((_, i) => (
              <div key={i} className="flex gap-4 py-3.5">
                <div className="w-16 aspect-[2/3] bg-muted rounded-lg animate-pulse shrink-0" />
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-4 bg-muted rounded animate-pulse w-2/3" />
                  <div className="h-3 bg-muted rounded animate-pulse w-1/4" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && list && list.items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <Film className="h-12 w-12 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">No titles in this list yet</p>
          </div>
        )}

        {/* No search/filter results */}
        {!loading && list && list.items.length > 0 && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
            <p className="text-sm text-muted-foreground">
              {search ? <>No titles match &ldquo;{search}&rdquo;</> : 'No titles match these filters'}
            </p>
            <button
              onClick={() => { setSearch(''); setTypeFilter('any'); }}
              className="text-xs text-primary font-bold"
            >
              Clear filters
            </button>
          </div>
        )}

        {/* Items */}
        {filtered.length > 0 && (
          <div className="divide-y divide-border">
            {filtered.map((item, i) => (
              <div key={item.movieId ?? i} className="group relative flex items-center gap-4 py-3.5">
                <Link href={`/movie/${item.movieId}`} className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="relative w-16 aspect-[2/3] overflow-hidden rounded-lg bg-muted shadow-md shrink-0">
                    {item.poster
                      ? <img src={item.poster} alt={item.title} className="w-full h-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
                      : <div className="w-full h-full flex items-center justify-center"><Film className="h-5 w-5 text-primary/60" /></div>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold font-headline line-clamp-2 group-hover:text-primary transition-colors leading-snug mb-0.5">
                      {item.title}
                    </h3>
                    <p className="text-xs text-muted-foreground">{item.year}</p>
                  </div>
                </Link>

                {/* Remove button (owner only) */}
                {isOwner && (
                  <button
                    onClick={() => removeItem(item)}
                    disabled={removingId === item.movieId}
                    className="shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity p-2 rounded-full hover:bg-red-500/20 text-muted-foreground hover:text-red-400 disabled:opacity-40"
                    aria-label={`Remove ${item.title} from list`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {search && filtered.length > 0 && (
          <p className="text-center text-xs text-muted-foreground py-2">
            {filtered.length} of {list?.items.length} title{list?.items.length !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* Refine modal */}
      {refineOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setRefineOpen(false)}
          />
          <div className="relative bg-background rounded-3xl w-full max-w-sm max-h-[75vh] flex flex-col overflow-hidden shadow-2xl border border-border">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border shrink-0">
              <button
                onClick={() => setRefineOpen(false)}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <span className="text-sm font-bold text-foreground">{list?.items.length ?? 0} Titles</span>
              <button
                onClick={applyRefine}
                className="text-sm font-bold text-primary hover:opacity-80 transition-opacity"
              >
                Refine
              </button>
            </div>

            {/* Scrollable content */}
            <div className="overflow-y-auto flex-1">
              {/* Sort By */}
              <div className="px-6 py-4 border-b border-border">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-bold text-foreground">Sort By</span>
                  <span className="text-sm text-muted-foreground">{SORT_LABELS[pendingSort]}</span>
                </div>
                <div className="space-y-1">
                  {(['added-desc', 'added-asc', 'release-desc', 'release-asc', 'title-asc', 'title-desc'] as SortOption[]).map(s => (
                    <button
                      key={s}
                      onClick={() => setPendingSort(s)}
                      className="w-full flex items-center justify-between py-2.5 text-sm"
                    >
                      <span className={pendingSort === s ? 'font-semibold text-foreground' : 'text-muted-foreground'}>
                        {SORT_LABELS[s]}
                      </span>
                      {pendingSort === s && <Check className="h-4 w-4 text-primary" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Type */}
              <div className="px-6 py-4">
                <p className="text-sm font-bold mb-3 text-foreground">Type</p>
                <div className="space-y-1">
                  {(['any', 'movie', 'show'] as TypeFilter[]).map(t => {
                    if (t !== 'any' && typeCounts[t] === 0) return null;
                    return (
                      <button
                        key={t}
                        onClick={() => setPendingType(t)}
                        className="w-full flex items-center justify-between py-2.5"
                      >
                        <div className="flex items-center gap-3">
                          {pendingType === t
                            ? <Check className="h-4 w-4 text-primary" />
                            : <span className="w-4" />
                          }
                          <span className={pendingType === t ? 'text-sm font-semibold text-foreground' : 'text-sm text-muted-foreground'}>
                            {TYPE_LABELS[t]}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">{typeCounts[t]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
