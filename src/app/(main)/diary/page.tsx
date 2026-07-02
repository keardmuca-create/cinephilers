"use client"

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, BookOpen, Film, Repeat, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { batchFetchMeta } from '@/lib/meta-batch';
import { removeFromWatchLog } from '@/lib/badges';
import { removeManualWatch } from '@/lib/media-id';
import { useAuth } from '@/contexts/auth-context';

interface DiaryEntry {
  id: string;
  tmdbId: string;
  mediaType: string;
  isRewatch: boolean;
  watchedAt: string;
}

interface EntryMeta { title: string; poster: string; year: string }

const PAGE_SIZE = 40;

// The diary is server-only data — fetched paginated, never mirrored into
// localStorage (deliberately unlike the rest of the library).
export default function DiaryPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [meta, setMeta] = useState<Record<string, EntryMeta>>({});
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadPage = async (p: number) => {
    try {
      const res = await fetchWithAuth(`/api/diary?page=${p}&limit=${PAGE_SIZE}`);
      if (!res.ok) return;
      const json = await res.json();
      const items: DiaryEntry[] = json.data?.items ?? [];
      setHasMore(json.data?.hasMore ?? false);
      setTotal(json.data?.total ?? 0);
      setEntries(prev => (p === 1 ? items : [...prev, ...items]));
      const metaMap = await batchFetchMeta(items.map(e => e.tmdbId));
      setMeta(prev => ({
        ...prev,
        ...Object.fromEntries(Object.entries(metaMap).map(([id, m]) => [id, { title: m.title, poster: m.poster, year: m.year }])),
      }));
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setLoading(false); return; }
    loadPage(1).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user?.id]);

  const removeEntry = async (entry: DiaryEntry) => {
    if (busyId) return;
    setBusyId(entry.id);
    try {
      // Server first, always — a fire-and-forget delete that fails silently
      // would resurrect the entry on the next sync.
      const res = await fetchWithAuth(`/api/diary/${entry.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setEntries(prev => prev.filter(e => e.id !== entry.id));
      setTotal(t => Math.max(0, t - 1));
      // Deleting the title's LAST entry un-marks it watched — mirror locally.
      if ((json.data?.remaining ?? 1) === 0) {
        try {
          localStorage.removeItem(`watched-${entry.tmdbId}`);
          removeFromWatchLog(entry.tmdbId, 'movie');
          removeManualWatch(entry.tmdbId);
        } catch { /* ignore */ }
        window.dispatchEvent(new Event('cinephilers-watched-changed'));
      }
      toast({ title: 'Diary entry removed' });
    } catch {
      toast({ title: "Couldn't remove the entry. Check your connection and try again.", variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  // Group by "Month Year" of the watch date, preserving newest-first order.
  const groups = useMemo(() => {
    const out: { label: string; items: DiaryEntry[] }[] = [];
    for (const e of entries) {
      const label = new Date(e.watchedAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(e);
      else out.push({ label, items: [e] });
    }
    return out;
  }, [entries]);

  return (
    <main className="pb-32">
      <div className="sticky top-[env(safe-area-inset-top)] z-10 bg-background/90 backdrop-blur-xl border-b border-border px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="rounded-full p-1 hover:bg-muted/60 transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-headline font-bold truncate flex-1 flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" /> Diary
        </h1>
        {total > 0 && <span className="text-xs text-muted-foreground font-semibold">{total} entries</span>}
      </div>

      {loading ? (
        <div className="px-6 py-20 text-center text-sm text-muted-foreground">Loading your diary…</div>
      ) : !user ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center px-6">
          <BookOpen className="h-12 w-12 text-muted-foreground/20" />
          <p className="text-muted-foreground text-sm">Log in to see your diary</p>
          <Button asChild className="rounded-full font-bold mt-2"><Link href="/login">Log In</Link></Button>
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center px-6">
          <BookOpen className="h-12 w-12 text-muted-foreground/20" />
          <p className="text-muted-foreground text-sm">Every film you watch gets a dated entry here</p>
        </div>
      ) : (
        <div className="px-6">
          {groups.map(group => (
            <section key={group.label} className="pt-6">
              <h2 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground mb-2">{group.label}</h2>
              <div className="divide-y divide-border">
                {group.items.map(entry => {
                  const m = meta[entry.tmdbId];
                  const day = new Date(entry.watchedAt).toLocaleDateString('en-US', { day: '2-digit' });
                  return (
                    <div key={entry.id} className="flex items-center gap-4 py-3">
                      <div className="w-8 text-center shrink-0">
                        <span className="text-lg font-black font-headline text-foreground">{day}</span>
                      </div>
                      <Link href={`/movie/${entry.tmdbId}`} className="group flex items-center gap-3 flex-1 min-w-0">
                        <div className="relative w-11 aspect-[2/3] overflow-hidden rounded-md bg-muted shrink-0">
                          {m?.poster ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={m.poster} alt={m?.title ?? ''} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center"><Film className="h-4 w-4 text-primary/60" /></div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold font-headline line-clamp-1 group-hover:text-primary transition-colors">
                            {m?.title ?? 'Loading…'} {m?.year ? <span className="text-muted-foreground font-normal">({m.year})</span> : null}
                          </p>
                          {entry.isRewatch && (
                            <p className="text-[11px] text-primary font-bold flex items-center gap-1 mt-0.5">
                              <Repeat className="h-3 w-3" /> Rewatch
                            </p>
                          )}
                        </div>
                      </Link>
                      <button
                        onClick={() => removeEntry(entry)}
                        disabled={busyId === entry.id}
                        aria-label={`Remove diary entry for ${m?.title ?? entry.tmdbId}`}
                        className="rounded-full p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
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
