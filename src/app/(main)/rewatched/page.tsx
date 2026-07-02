"use client"

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Repeat, Film } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { batchFetchMeta } from '@/lib/meta-batch';
import { useAuth } from '@/contexts/auth-context';

interface RewatchedItem {
  tmdbId: string;
  count: number;
  lastWatchedAt: string | null;
  title: string;
  poster: string;
  year: string;
}

const PAGE_SIZE = 24;

// Full grid behind the profile's Rewatched shelf — every title watched 2+
// times, most-rewatched first. Server data, paginated.
export default function RewatchedPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<RewatchedItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadPage = async (p: number) => {
    if (!user?.username) return;
    try {
      const res = await fetchWithAuth(`/api/users/${user.username}/rewatched?page=${p}&limit=${PAGE_SIZE}`);
      if (!res.ok) return;
      const json = await res.json();
      const rows: { tmdbId: string; count: number; lastWatchedAt: string | null }[] = json.data?.items ?? [];
      setHasMore(json.data?.hasMore ?? false);
      if (rows.length === 0) return;
      const meta = await batchFetchMeta(rows.map(r => r.tmdbId));
      const mapped = rows.map(r => ({
        ...r,
        title: meta[r.tmdbId]?.title ?? 'Untitled',
        poster: meta[r.tmdbId]?.poster ?? '',
        year: meta[r.tmdbId]?.year ?? '',
      }));
      setItems(prev => (p === 1 ? mapped : [...prev, ...mapped]));
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setLoading(false); return; }
    loadPage(1).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user?.id]);

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
        <div className="px-6 pt-6">
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-4">
            {items.map(item => (
              <Link key={item.tmdbId} href={`/movie/${item.tmdbId}`} className="group">
                <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-muted shadow-lg movie-card-hover mb-2">
                  {item.poster ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.poster} alt={item.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"><Film className="h-9 w-9 text-primary/60" /></div>
                  )}
                  <div className="absolute top-1.5 right-1.5 flex items-center gap-1 bg-background/85 backdrop-blur-sm rounded-full px-2 py-0.5">
                    <Repeat className="h-3 w-3 text-primary" />
                    <span className="text-xs font-black text-foreground">&times;{item.count}</span>
                  </div>
                </div>
                <p className="text-xs font-semibold font-headline line-clamp-2 group-hover:text-primary transition-colors leading-snug">
                  {item.title} {item.year ? `(${item.year})` : ''}
                </p>
              </Link>
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
        </div>
      )}
    </main>
  );
}
