"use client"

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bookmark, ChevronLeft, Search, SlidersHorizontal, X, Film, Trash2 } from 'lucide-react';
import { getAddedAt, legacyTwin } from '@/lib/media-id';
import { persistRefine } from '@/lib/refine-sort';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { removeActivity } from '@/lib/activity';
import { batchFetchMeta } from '@/lib/meta-batch';
import { getItemType, sideOf, SIDE_TYPES, TYPE_LABELS, type TypeFilter, type MediaSide } from '@/lib/media-type';
import { MediaToggle } from '@/components/media-toggle';
import { RefineSheet, type RefineValue, type SortOption, type CountOption } from '@/components/refine-sheet';
import { useCommunityRatings } from '@/hooks/use-community-ratings';
import { toast } from '@/hooks/use-toast';
import { resolveDisplayRating } from '@/lib/cinephilers-rating';

const SORT_OPTIONS: SortOption[] = [
  { value: 'recent',  label: 'Date added' },
  { value: 'release', label: 'Release date' },
  { value: 'title',   label: 'Title' },
];

const DEFAULT_REFINE: RefineValue = { sortField: 'recent', sortDir: 'desc', type: 'any', genre: 'any' };

interface WatchlistItem {
  id: string;
  title: string;
  poster: string;
  year: string;
  releaseDate?: string;  // full date, for precise release-date sorting
  tmdbRating?: number;
  kind: TypeFilter;      // movie / tv-series / … for the Type filter
  mediaType: 'MOVIE' | 'SHOW';  // for the server delete (a "tv-movie" kind is still a MOVIE row)
  genre: string;         // comma-joined genres, for the Genre filter
}

// When sorting by release date, show the full date so the order reads clearly
// (two 2026 films otherwise look identical). Falls back to the year.
function releaseLabel(item: WatchlistItem): string {
  if (!item.releaseDate) return item.year;
  const d = new Date(item.releaseDate);
  return Number.isNaN(d.getTime()) ? item.year : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function ItemCard({ item, onRemove, showReleaseDate }: { item: WatchlistItem; onRemove: () => void; showReleaseDate?: boolean }) {
  const cine = useCommunityRatings([item.id]);
  const shown = resolveDisplayRating(item.tmdbRating, cine[item.id]);
  // Await the server delete and confirm it before dropping the row locally — a
  // silently-failed delete leaves the DB row alive, which the next DB→local sync
  // resurrects. Also clears the legacy bare-numeric twin key.
  const handleRemove = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const res = await fetchWithAuth(`/api/watchlist/${item.id}?mediaType=${item.mediaType}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      toast({ title: "Couldn't remove this. Check your connection and try again.", variant: 'destructive' });
      return;
    }
    try {
      localStorage.removeItem(`watchlist-${item.id}`);
      const twin = legacyTwin(item.id);
      if (twin) localStorage.removeItem(`watchlist-${twin}`);
    } catch { /* ignore */ }
    removeActivity('watchlist', item.id);
    onRemove();
  };

  return (
    <Link href={`/movie/${item.id}`} className="group relative flex items-center gap-4 py-3.5">
      <div className="relative w-20 aspect-[2/3] overflow-hidden rounded-lg bg-muted shadow-md shrink-0">
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
        <p className="text-xs text-muted-foreground mb-1.5">{showReleaseDate ? releaseLabel(item) : item.year}</p>
        {shown && (
          <div className="flex items-center gap-0.5">
            <span className={`text-xs font-bold ${shown.source === 'cinephilers' ? 'text-primary' : 'text-yellow-400'}`}>★</span>
            <span className="text-xs font-bold text-foreground">{shown.value.toFixed(1)}</span>
          </div>
        )}
      </div>

      {/* Delete button */}
      <button
        onClick={handleRemove}
        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-2 rounded-full hover:bg-red-500/20 text-muted-foreground hover:text-red-400"
        aria-label={`Remove ${item.title} from watchlist`}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </Link>
  );
}

export default function WatchlistPage() {
  const router = useRouter();
  const [items, setItems]           = useState<WatchlistItem[]>([]);
  const [fetchingMeta, setFetchingMeta] = useState(false);
  const [search, setSearch]         = useState('');
  const [refineOpen, setRefineOpen] = useState(false);
  // Server-safe default; the saved refine is restored from localStorage after
  // mount (reading it during render would mismatch the server and break hydration).
  const [refine, setRefine]         = useState<RefineValue>(DEFAULT_REFINE);
  // Films and shows are listed separately here too, with no combined view.
  const [side, setSide]             = useState<MediaSide>('movies');

  const changeSide = (next: MediaSide) => {
    setSide(next);
    try { localStorage.setItem('watchlist-side', next); } catch { /* ignore */ }
    // A type filter only exists on one side; carrying it across would empty the
    // other side with no visible cause.
    setRefine(prev => (prev.type !== 'any' ? { ...prev, type: 'any' } : prev));
  };

  useEffect(() => {
    const readRefine = () => {
      try {
        const saved = localStorage.getItem('watchlist-refine');
        if (saved) setRefine({ ...DEFAULT_REFINE, ...JSON.parse(saved) });
      } catch { /* ignore */ }
    };
    readRefine();
    try {
      const savedSide = localStorage.getItem('watchlist-side');
      if (savedSide === 'movies' || savedSide === 'shows') setSide(savedSide);
    } catch { /* ignore */ }
    // Login sync may restore the account's saved sort into localStorage after
    // this page has already mounted — re-read it then so it applies immediately.
    window.addEventListener('cinephilers-db-restored', readRefine);
    return () => window.removeEventListener('cinephilers-db-restored', readRefine);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const classify = (m: { isEpisode?: unknown; type?: unknown; showType?: unknown; genre?: unknown; runtime?: unknown }): TypeFilter =>
      getItemType({
        isEpisode: m.isEpisode as boolean | undefined,
        type: m.type as 'movie' | 'show' | undefined,
        showType: m.showType as string | undefined,
        genre: m.genre as string | undefined,
        runtime: m.runtime as number | undefined,
      });

    const load = async () => {
      const loaded: WatchlistItem[] = [];
      const missing: string[] = [];   // no title yet — need a full fetch
      const needMeta: string[] = [];  // has title but missing release date / classification fields
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i)!;
          if (!k.startsWith('watchlist-')) continue;
          const raw = localStorage.getItem(k);
          if (!raw) continue;
          let meta: Record<string, unknown>;
          try { meta = JSON.parse(raw); } catch { continue; }
          const id = k.slice('watchlist-'.length);
          // Fold in the cached meta entry — it carries the full release date, genre,
          // and classification fields (the watchlist-* entry only keeps the year).
          try {
            const cached = localStorage.getItem(`meta-${id}`);
            if (cached) meta = { ...JSON.parse(cached), ...meta };
          } catch { /* ignore */ }
          if (!meta.title) { missing.push(id); continue; }
          const releaseDate = typeof meta.releaseDate === 'string' ? meta.releaseDate : undefined;
          if (releaseDate === undefined) needMeta.push(id);
          loaded.push({
            id,
            title: meta.title as string,
            poster: (meta.poster as string) ?? '',
            year:   (meta.year as string) ?? '',
            releaseDate,
            tmdbRating: typeof meta.tmdbRating === 'number' ? meta.tmdbRating : undefined,
            kind: classify(meta),
            mediaType: meta.type === 'show' ? 'SHOW' : 'MOVIE',
            genre: typeof meta.genre === 'string' ? meta.genre : '',
          });
        }
      } catch { /* ignore */ }
      if (!cancelled) setItems(loaded);

      if (missing.length === 0 && needMeta.length === 0) {
        if (!cancelled) setFetchingMeta(false);
        return;
      }
      if (!cancelled) setFetchingMeta(missing.length > 0);
      // Fetch full metadata for rows missing a title or a release date, so the
      // release-date sort and the Type/Genre filters have what they need.
      const metaMap = await batchFetchMeta([...missing, ...needMeta], { needReleaseDate: true });
      if (!cancelled) {
        const fetched: WatchlistItem[] = missing.flatMap(id => {
          const m = metaMap[id];
          if (!m?.title) return [];
          try {
            localStorage.setItem(`watchlist-${id}`, JSON.stringify({ id, title: m.title, poster: m.poster ?? '', year: m.year ?? '', type: m.type ?? 'movie' }));
          } catch { /* ignore */ }
          return [{
            id, title: m.title, poster: m.poster ?? '', year: m.year ?? '',
            releaseDate: m.releaseDate, tmdbRating: typeof m.tmdbRating === 'number' ? m.tmdbRating : undefined,
            kind: classify(m), mediaType: m.type === 'show' ? 'SHOW' : 'MOVIE', genre: m.genre ?? '',
          }];
        });
        // Backfill release date / classification on rows we already showed.
        const updates = new Map<string, { releaseDate?: string; kind: TypeFilter; mediaType: 'MOVIE' | 'SHOW'; genre: string }>();
        for (const id of needMeta) {
          const m = metaMap[id];
          if (m) updates.set(id, { releaseDate: m.releaseDate, kind: classify(m), mediaType: m.type === 'show' ? 'SHOW' : 'MOVIE', genre: m.genre ?? '' });
        }
        if (fetched.length > 0 || updates.size > 0) {
          setItems(prev => {
            const seen = new Set(prev.map(p => p.id));
            const merged = prev.map(p => updates.has(p.id) ? { ...p, ...updates.get(p.id)! } : p);
            return [...merged, ...fetched.filter(f => !seen.has(f.id))];
          });
        }
        if (!cancelled) setFetchingMeta(false);
      }
    };

    load();
    // Re-load once the login sync finishes writing DB items into localStorage
    const handler = () => { load(); };
    window.addEventListener('cinephilers-db-restored', handler);
    return () => {
      cancelled = true;
      window.removeEventListener('cinephilers-db-restored', handler);
    };
  }, []);

  // ─── Movies / Shows split ──────────────────────────────────────────────────
  // Saved episodes are NOT folded into their show here. On the watchlist an
  // episode is a deliberate, separate intent — an anthology instalment, or one
  // a favourite actor guest-stars in — so collapsing it would erase the reason
  // it was saved. Watch History collapses because there the show is the thing
  // you're working through; here it isn't.

  const sideItems = useMemo(() => items.filter(i => sideOf(i.kind as Exclude<TypeFilter, 'any'>) === side), [items, side]);

  const sideCounts = useMemo(() => {
    let movies = 0, shows = 0;
    for (const it of items) (sideOf(it.kind as Exclude<TypeFilter, 'any'>) === 'shows' ? shows++ : movies++);
    return { movies, shows };
  }, [items]);

  // Per-type counts for the Type filter, narrowed to this side's own sub-types
  // and to the kinds actually present.
  const typeOptions = useMemo<CountOption[]>(() => {
    const counts = new Map<TypeFilter, number>();
    for (const it of sideItems) counts.set(it.kind, (counts.get(it.kind) ?? 0) + 1);
    const present = SIDE_TYPES[side].filter(t => (counts.get(t) ?? 0) > 0);
    if (present.length <= 1) return [];
    return [
      { value: 'any', label: 'Any', count: sideItems.length },
      ...present.map(t => ({ value: t, label: TYPE_LABELS[t], count: counts.get(t)! })),
    ];
  }, [sideItems, side]);

  // Per-genre counts, most common first.
  const genreOptions = useMemo<CountOption[]>(() => {
    const counts = new Map<string, number>();
    for (const it of sideItems) {
      for (const g of it.genre.split(',').map(s => s.trim()).filter(Boolean)) {
        counts.set(g, (counts.get(g) ?? 0) + 1);
      }
    }
    const entries = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (entries.length === 0) return [];
    return [
      { value: 'any', label: 'Any', count: sideItems.length },
      ...entries.map(([g, c]) => ({ value: g, label: g, count: c })),
    ];
  }, [sideItems]);

  const sortedFiltered = useMemo(() => {
    let result = [...sideItems];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(i => i.title.toLowerCase().includes(q));
    }
    if (refine.type !== 'any')  result = result.filter(i => i.kind === refine.type);
    if (refine.genre !== 'any') result = result.filter(i => i.genre.split(',').map(s => s.trim()).includes(refine.genre));

    if (refine.sortField === 'recent') {
      // Title tie-break: bulk-imported items share one addedAt, and without a
      // deterministic tie-break their order reshuffles on every login sync.
      result.sort((a, b) => (getAddedAt(b.id) - getAddedAt(a.id)) || a.title.localeCompare(b.title));
      if (refine.sortDir === 'asc') result.reverse();
    } else if (refine.sortField === 'title') {
      result.sort((a, b) => a.title.localeCompare(b.title));
      if (refine.sortDir === 'desc') result.reverse();
    } else if (refine.sortField === 'release') {
      // Full release-date timestamp; falls back to Jan 1 of the year, null when unknown.
      const ts = (it: WatchlistItem): number | null => {
        const raw = it.releaseDate || (/^\d{4}$/.test(it.year) ? `${it.year}-01-01` : '');
        const t = raw ? Date.parse(raw) : NaN;
        return Number.isNaN(t) ? null : t;
      };
      const dir = refine.sortDir === 'desc' ? -1 : 1;
      result.sort((a, b) => {
        const ta = ts(a), tb = ts(b);
        if (ta === null && tb === null) return 0;
        if (ta === null) return 1;   // unknown date always sinks to the bottom
        if (tb === null) return -1;
        return (ta - tb) * dir;
      });
    }
    return result;
  }, [sideItems, search, refine]);

  const sortLabel = SORT_OPTIONS.find(s => s.value === refine.sortField)?.label ?? '';
  const filterNote =
    (refine.type !== 'any' ? ` · ${TYPE_LABELS[refine.type as TypeFilter]}` : '') +
    (refine.genre !== 'any' ? ` · ${refine.genre}` : '');

  return (
    <main className="pb-32">
      {/* Header */}
      <div className="sticky top-[env(safe-area-inset-top)] z-10 bg-background/90 backdrop-blur-xl border-b border-border px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="rounded-full p-1 hover:bg-muted/60 transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-headline font-bold truncate flex-1">Watchlist</h1>
      </div>

      {/* Movies | Shows */}
      <div className="px-6 pt-4">
        <MediaToggle value={side} onChange={changeSide} counts={sideCounts} />
      </div>

      {/* Search */}
      <div className="px-6 pt-3 pb-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input type="text" placeholder="Search watchlist" value={search} onChange={e => setSearch(e.target.value)}
            className="w-full bg-muted border-2 border-primary/80 rounded-2xl pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors" />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Sort bar */}
      <div className="px-6 pb-4 flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground truncate">
          {sortedFiltered.length} {side === 'shows' ? 'show' : 'title'}{sortedFiltered.length !== 1 ? 's' : ''} · {sortLabel}{filterNote}
        </p>
        <button onClick={() => setRefineOpen(true)}
          className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:opacity-80 transition-opacity shrink-0">
          <SlidersHorizontal className="h-3.5 w-3.5" /> Refine
        </button>
      </div>

      {/* List */}
      {items.length === 0 && fetchingMeta ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center px-6">
          <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-muted-foreground text-sm">Loading your watchlist…</p>
        </div>
      ) : sideItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center px-6">
          <Bookmark className="h-12 w-12 text-muted-foreground/20" />
          <p className="text-muted-foreground text-sm">
            {side === 'shows' ? 'Save shows to watch later' : 'Save movies to watch later'}
          </p>
        </div>
      ) : sortedFiltered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center px-6">
          <Search className="h-10 w-10 text-muted-foreground/20" />
          <p className="text-muted-foreground text-sm">No titles match your filters</p>
        </div>
      ) : (
        <div className="px-6 divide-y divide-border">
          {sortedFiltered.map(item => (
            <ItemCard key={item.id} item={item} showReleaseDate={refine.sortField === 'release'} onRemove={() => setItems(prev => prev.filter(i => i.id !== item.id))} />
          ))}
        </div>
      )}

      <RefineSheet
        open={refineOpen}
        onClose={() => setRefineOpen(false)}
        total={sideItems.length}
        sortOptions={SORT_OPTIONS}
        typeOptions={typeOptions}
        genreOptions={genreOptions}
        value={refine}
        onApply={v => {
          setRefine(v);
          persistRefine('watchlist-refine', v);
        }}
      />
    </main>
  );
}
