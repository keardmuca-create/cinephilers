"use client"

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Search, X, Film, Lock, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fetchWithAuth } from '@/lib/fetch-with-auth';

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

  const [list, setList] = useState<ReturnType<typeof normalise> | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

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

  const filtered = useMemo(() => {
    if (!list) return [];
    if (!search.trim()) return list.items;
    const q = search.trim().toLowerCase();
    return list.items.filter(i => i.title.toLowerCase().includes(q));
  }, [list, search]);

  return (
    <main className="max-w-xl mx-auto pb-32">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-xl border-b border-white/5 px-4 py-4 flex items-center gap-3">
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
              className="w-full bg-white/5 border border-white/10 rounded-2xl pl-10 pr-10 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && !list && (
          <div className="divide-y divide-white/[0.06]">
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

        {/* No search results */}
        {!loading && list && list.items.length > 0 && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
            <p className="text-sm text-muted-foreground">No titles match &ldquo;{search}&rdquo;</p>
            <button onClick={() => setSearch('')} className="text-xs text-primary font-bold">Clear search</button>
          </div>
        )}

        {/* Items */}
        {filtered.length > 0 && (
          <div className="divide-y divide-white/[0.06]">
            {filtered.map((item, i) => (
              <Link
                key={item.movieId ?? i}
                href={`/movie/${item.movieId}`}
                className="group flex items-center gap-4 py-3.5"
              >
                <div className="relative w-16 aspect-[2/3] overflow-hidden rounded-lg bg-muted shadow-md shrink-0">
                  {item.poster
                    ? <img src={item.poster} alt={item.title} className="w-full h-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
                    : <div className="w-full h-full flex items-center justify-center"><Film className="h-5 w-5 text-muted-foreground/40" /></div>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold font-headline line-clamp-2 group-hover:text-primary transition-colors leading-snug mb-0.5">
                    {item.title}
                  </h3>
                  <p className="text-xs text-muted-foreground">{item.year}</p>
                </div>
              </Link>
            ))}
          </div>
        )}

        {search && filtered.length > 0 && (
          <p className="text-center text-xs text-muted-foreground py-2">
            {filtered.length} of {list?.items.length} title{list?.items.length !== 1 ? 's' : ''}
          </p>
        )}
      </div>
    </main>
  );
}
