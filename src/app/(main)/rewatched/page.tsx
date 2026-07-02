"use client"

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Repeat, Film, Search, X, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { batchFetchMeta } from '@/lib/meta-batch';
import { useAuth } from '@/contexts/auth-context';

interface RewatchedItem {
  tmdbId: string;
  mediaType: string;
  count: number;
  lastWatchedAt: string | null;
  title: string;
  poster: string;
  year: string;
  tmdbRating?: number;
  userRating?: number;
}

interface WatchDate { id: string; watchedAt: string; isRewatch: boolean }

const PAGE_SIZE = 40;

// "See All" behind the profile's Rewatched shelf — Watch History-style list.
// Each row carries its x-count badge; tapping it expands the row into that
// title's full watch-date history (fetched on demand from the diary).
export default function RewatchedPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<RewatchedItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [dates, setDates] = useState<Record<string, WatchDate[]>>({});

  const loadPage = async (p: number) => {
    if (!user?.username) return;
    try {
      const res = await fetchWithAuth(`/api/users/${user.username}/rewatched?page=${p}&limit=${PAGE_SIZE}`);
      if (!res.ok) return;
      const json = await res.json();
      const rows: { tmdbId: string; mediaType: string; count: number; lastWatchedAt: string | null }[] = json.data?.items ?? [];
      setHasMore(json.data?.hasMore ?? false);
      if (rows.length === 0) return;
      const meta = await batchFetchMeta(rows.map(r => r.tmdbId));
      const mapped = rows.map(r => {
        let userRating: number | undefined;
        try {
          const saved = localStorage.getItem(`movie-rating-${r.tmdbId}`);
          if (saved) userRating = parseInt(saved, 10);
        } catch { /* ignore */ }
        return {
          ...r,
          title: meta[r.tmdbId]?.title ?? 'Untitled',
          poster: meta[r.tmdbId]?.poster ?? '',
          year: meta[r.tmdbId]?.year ?? '',
          tmdbRating: meta[r.tmdbId]?.tmdbRating,
          userRating,
        };
      });
      setItems(prev => (p === 1 ? mapped : [...prev, ...mapped]));
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setLoading(false); return; }
    loadPage(1).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user?.id]);

  // Tap the x-count: expand the row into every logged watch date for the title.
  const toggleDates = async (item: RewatchedItem) => {
    if (expanded === item.tmdbId) { setExpanded(null); return; }
    setExpanded(item.tmdbId);
    if (dates[item.tmdbId]) return; // already fetched
    try {
      const res = await fetchWithAuth(`/api/diary?tmdbId=${encodeURIComponent(item.tmdbId)}&mediaType=${item.mediaType}&limit=100`);
      if (!res.ok) return;
      const json = await res.json();
      setDates(prev => ({ ...prev, [item.tmdbId]: json.data?.items ?? [] }));
    } catch { /* ignore */ }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.trim().toLowerCase();
    return items.filter(i => i.title.toLowerCase().includes(q));
  }, [items, search]);

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <main className="pb-32">
      <div className="sticky top-[env(safe-area-inset-top)] z-10 bg-background/90 backdrop-blur-xl border-b border-border px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="rounded-full p-1 hover:bg-muted/60 transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-headline font-bold truncate flex-1 flex items-center gap-2">
          <Repeat className="h-5 w-5 text-primary" /> Rewatched
        </h1>
      </div>

      {loading ? (
        <div className="px-6 py-20 text-center text-sm text-muted-foreground">Loading…</div>
      ) : !user ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center px-6">
          <Repeat className="h-12 w-12 text-muted-foreground/20" />
          <p className="text-muted-foreground text-sm">Log in to see your rewatches</p>
          <Button asChild className="rounded-full font-bold mt-2"><Link href="/login">Log In</Link></Button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center px-6">
          <Repeat className="h-12 w-12 text-muted-foreground/20" />
          <p className="text-muted-foreground text-sm">Titles you watch more than once will appear here</p>
        </div>
      ) : (
        <>
          <div className="px-6 pt-6 pb-1">
            <h2 className="text-3xl font-headline font-bold mb-0.5">Rewatched</h2>
            <p className="text-muted-foreground text-sm">{items.length} Title{items.length !== 1 ? 's' : ''}</p>
          </div>

          {/* Search bar */}
          <div className="px-6 pt-4 pb-3">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search this page"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-muted border-2 border-primary/80 rounded-2xl pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <div className="px-6 pb-2">
            <p className="text-xs text-muted-foreground">{filtered.length} title{filtered.length !== 1 ? 's' : ''} · Most rewatched</p>
          </div>

          <div className="px-6 divide-y divide-border">
            {filtered.map(item => (
              <div key={item.tmdbId} className="py-3.5">
                <div className="flex items-center gap-4">
                  <Link href={`/movie/${item.tmdbId}`} className="group flex items-center gap-4 flex-1 min-w-0">
                    <div className="relative w-16 aspect-[2/3] overflow-hidden rounded-lg bg-muted shadow-md shrink-0">
                      {item.poster ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.poster} alt={item.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center"><Film className="h-5 w-5 text-primary/60" /></div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold font-headline line-clamp-2 group-hover:text-primary transition-colors leading-snug mb-0.5">
                        {item.title}
                      </h3>
                      <p className="text-xs text-muted-foreground mb-1.5">{item.year}</p>
                      <div className="flex items-center gap-2.5 flex-wrap">
                        {item.tmdbRating !== undefined && item.tmdbRating > 0 && (
                          <div className="flex items-center gap-0.5">
                            <span className="text-xs text-yellow-400 font-bold">★</span>
                            <span className="text-xs font-bold text-foreground">{item.tmdbRating.toFixed(1)}</span>
                          </div>
                        )}
                        {item.userRating !== undefined && (
                          <div className="flex items-center gap-0.5">
                            <span className="text-xs text-blue-400 font-bold">★</span>
                            <span className="text-xs font-bold text-blue-400">{item.userRating}</span>
                          </div>
                        )}
                        {item.lastWatchedAt && (
                          <span className="text-xs text-muted-foreground">Last on {fmtDate(item.lastWatchedAt)}</span>
                        )}
                      </div>
                    </div>
                  </Link>
                  <button
                    onClick={() => toggleDates(item)}
                    aria-label={`Show all watch dates for ${item.title}`}
                    className="flex items-center gap-1.5 bg-muted rounded-full px-3 py-1.5 shrink-0 hover:bg-primary/10 transition-colors"
                  >
                    <Repeat className="h-3.5 w-3.5 text-primary" />
                    <span className="text-sm font-black text-foreground">&times;{item.count}</span>
                    {expanded === item.tmdbId
                      ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                      : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                  </button>
                </div>

                {/* Expanded: every logged watch date for this title */}
                {expanded === item.tmdbId && (
                  <div className="mt-3 ml-20 border-l-2 border-primary/20 pl-4 space-y-1.5">
                    {!dates[item.tmdbId] ? (
                      <p className="text-xs text-muted-foreground">Loading dates…</p>
                    ) : (
                      dates[item.tmdbId].map(d => (
                        <div key={d.id} className="flex items-center gap-2 text-xs">
                          <span className="font-semibold text-foreground">{fmtDate(d.watchedAt)}</span>
                          {d.isRewatch ? (
                            <span className="text-primary font-bold flex items-center gap-1"><Repeat className="h-3 w-3" /> Rewatch</span>
                          ) : (
                            <span className="text-muted-foreground">First watch</span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {hasMore && (
            <div className="pt-8 text-center">
              <Button
                variant="outline"
                className="rounded-full font-bold"
                onClick={() => { const next = page + 1; setPage(next); loadPage(next); }}
              >
                Load more
              </Button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
