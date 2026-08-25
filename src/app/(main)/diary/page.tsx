"use client"

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Repeat, Film, Search, X, ChevronDown, ChevronUp, Trash2, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { batchFetchMeta } from '@/lib/meta-batch';
import { removeFromWatchLog } from '@/lib/watch-log';
import { removeManualWatch } from '@/lib/media-id';
import { readSavedRefine, persistRefine } from '@/lib/refine-sort';
import { RefineSheet, type RefineValue } from '@/components/refine-sheet';
import { useAuth } from '@/contexts/auth-context';
import { WatchedEye } from '@/components/watched-eye';
import { CommunityStar } from '@/components/community-star';

interface DiaryTitle {
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

// Refine: Recent (by latest watch date) or Most rewatched (by count); direction
// arrow flips each. Persisted per-account like the other list pages.
const DEFAULT_REFINE: RefineValue = { sortField: 'recent', sortDir: 'desc', type: 'any', genre: 'any' };
const SORT_OPTIONS = [
  { value: 'recent', label: 'Recently watched' },
  { value: 'count', label: 'Most rewatched' },
];

// The diary: one row per title with its watch count; tapping the xN badge
// expands the row into every logged watch date (with per-date delete).
// "Recent" = latest watch first (the diary feel); "Most rewatched" = comfort
// movies ranking. Server data only — never mirrored into localStorage.
export default function DiaryPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<DiaryTitle[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [refine, setRefine] = useState<RefineValue>(DEFAULT_REFINE);
  const [refineOpen, setRefineOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [dates, setDates] = useState<Record<string, WatchDate[]>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  // Restore the saved refine after mount + re-read once the login sync lands.
  useEffect(() => {
    const read = () => { const v = readSavedRefine('rewatched-refine'); if (v) setRefine({ ...DEFAULT_REFINE, ...v }); };
    read();
    window.addEventListener('cinephilers-db-restored', read);
    return () => window.removeEventListener('cinephilers-db-restored', read);
  }, []);

  const loadPage = async (p: number, r: RefineValue) => {
    if (!user?.username) return;
    try {
      const sort = r.sortField === 'count' ? 'count' : 'recent';
      const res = await fetchWithAuth(`/api/users/${user.username}/rewatched?min=2&sort=${sort}&dir=${r.sortDir}&page=${p}&limit=${PAGE_SIZE}`);
      if (!res.ok) return;
      const json = await res.json();
      const rows: { tmdbId: string; mediaType: string; count: number; lastWatchedAt: string | null }[] = json.data?.items ?? [];
      setHasMore(json.data?.hasMore ?? false);
      if (rows.length === 0) { if (p === 1) setItems([]); return; }
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
    setLoading(true);
    setPage(1);
    setExpanded(null);
    loadPage(1, refine).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user?.id, refine]);

  // Tap the x-count: expand the row into every logged watch date for the title.
  const toggleDates = async (item: DiaryTitle) => {
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

  // Delete one logged date ("logged by mistake"). Server first, always —
  // deleting the title's last entry also un-marks it watched.
  const removeDate = async (item: DiaryTitle, d: WatchDate) => {
    if (busyId) return;
    setBusyId(d.id);
    try {
      const res = await fetchWithAuth(`/api/diary/${d.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const remaining = json.data?.remaining ?? 0;
      setDates(prev => ({ ...prev, [item.tmdbId]: (prev[item.tmdbId] ?? []).filter(x => x.id !== d.id) }));
      if (remaining === 0) {
        setItems(prev => prev.filter(x => x.tmdbId !== item.tmdbId));
        setExpanded(null);
        try {
          localStorage.removeItem(`watched-${item.tmdbId}`);
          removeFromWatchLog(item.tmdbId, 'movie');
          removeManualWatch(item.tmdbId);
        } catch { /* ignore */ }
        window.dispatchEvent(new Event('cinephilers-watched-changed'));
      } else {
        setItems(prev => prev.map(x => (x.tmdbId === item.tmdbId ? { ...x, count: remaining } : x)));
      }
      toast({ title: 'Entry removed' });
    } catch {
      toast({ title: "Couldn't remove the entry. Check your connection and try again.", variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
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
      ) : items.length === 0 && !search ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center px-6">
          <Repeat className="h-12 w-12 text-muted-foreground/20" />
          <p className="text-muted-foreground text-sm">Films you&apos;ve watched more than once show up here, with every date</p>
        </div>
      ) : (
        <>
          <div className="px-6 pt-6 pb-1">
            <h2 className="text-3xl font-headline font-bold mb-0.5">Rewatched</h2>
            <p className="text-muted-foreground text-sm">{items.length}{hasMore ? '+' : ''} Title{items.length !== 1 ? 's' : ''}</p>
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

          {/* Sorted-by note + Refine button (matches the other list pages) */}
          <div className="px-6 pb-4 flex items-center justify-between">
            <p className="text-xs text-muted-foreground truncate">
              {filtered.length} title{filtered.length !== 1 ? 's' : ''} · {SORT_OPTIONS.find(s => s.value === refine.sortField)?.label ?? 'Recently watched'}
            </p>
            <button
              onClick={() => setRefineOpen(true)}
              className="flex items-center gap-1.5 text-xs font-semibold rounded-full px-3 py-1.5 border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" /> Refine
            </button>
          </div>

          <div className="px-6 divide-y divide-border">
            {filtered.map(item => (
              <div key={item.tmdbId} className="py-3.5">
                <div className="flex items-center gap-4">
                  <Link href={`/movie/${item.tmdbId}`} className="group flex items-center gap-4 flex-1 min-w-0">
                    <div className="relative w-20 aspect-[2/3] overflow-hidden rounded-lg bg-muted shadow-md shrink-0">
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
                        <CommunityStar id={item.tmdbId} tmdbRating={item.tmdbRating} />
                        {item.userRating !== undefined && (
                          <div className="flex items-center gap-0.5">
                            <span className="text-xs text-primary font-bold">☆</span>
                            <span className="text-xs font-bold text-primary">{item.userRating}</span>
                          </div>
                        )}
                        <WatchedEye state="complete" className="h-3.5 w-3.5" />
                        {item.lastWatchedAt && (
                          <span className="text-xs text-muted-foreground">
                            {item.count > 1 ? 'Last on' : 'Watched'} {fmtDate(item.lastWatchedAt)}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                  <button
                    onClick={() => toggleDates(item)}
                    aria-label={`Show all watch dates for ${item.title}`}
                    className="flex items-center gap-1.5 bg-muted rounded-full px-3 py-1.5 shrink-0 hover:bg-primary/10 transition-colors"
                  >
                    <Repeat className={`h-3.5 w-3.5 ${item.count > 1 ? 'text-primary' : 'text-muted-foreground'}`} />
                    <span className="text-sm font-black text-foreground">&times;{item.count}</span>
                    {expanded === item.tmdbId
                      ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                      : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                  </button>
                </div>

                {/* Expanded: every logged watch date for this title */}
                {expanded === item.tmdbId && (
                  <div className="mt-3 ml-20 border-l-2 border-primary/20 pl-4 space-y-1">
                    {!dates[item.tmdbId] ? (
                      <p className="text-xs text-muted-foreground">Loading dates…</p>
                    ) : (
                      dates[item.tmdbId].map(d => (
                        <div key={d.id} className="flex items-center gap-2 text-xs group/date">
                          <span className="font-semibold text-foreground">{fmtDate(d.watchedAt)}</span>
                          {d.isRewatch ? (
                            <span className="text-primary font-bold flex items-center gap-1"><Repeat className="h-3 w-3" /> Rewatch</span>
                          ) : (
                            <span className="text-muted-foreground">First watch</span>
                          )}
                          <button
                            onClick={() => removeDate(item, d)}
                            disabled={busyId === d.id}
                            aria-label={`Remove ${fmtDate(d.watchedAt)} entry for ${item.title}`}
                            className="p-1 rounded-full text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
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
                onClick={() => { const next = page + 1; setPage(next); loadPage(next, refine); }}
              >
                Load more
              </Button>
            </div>
          )}
        </>
      )}

      <RefineSheet
        open={refineOpen}
        onClose={() => setRefineOpen(false)}
        total={items.length}
        sortOptions={SORT_OPTIONS}
        typeOptions={[]}
        genreOptions={[]}
        value={refine}
        onApply={v => { setRefine(v); persistRefine('rewatched-refine', v); }}
      />
    </main>
  );
}
