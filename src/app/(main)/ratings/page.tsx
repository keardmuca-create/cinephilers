"use client"

import React, { useState, useEffect, useRef, useMemo, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Star, ChevronLeft, Search, SlidersHorizontal, X, Film, Eye } from 'lucide-react';
import { normalizeLocalMediaIds, getRatedAt } from '@/lib/media-id';
import { persistRefine } from '@/lib/refine-sort';
import { batchFetchMeta } from '@/lib/meta-batch';
import { getItemType, sideOf, SIDE_TYPES, TYPE_LABELS, type TypeFilter, type MediaSide } from '@/lib/media-type';
import { collapseRatings, type CollapsedRating } from '@/lib/collapse-ratings';
import { MediaToggle } from '@/components/media-toggle';
import { RefineSheet, type RefineValue, type SortOption, type CountOption } from '@/components/refine-sheet';

const SORT_OPTIONS: SortOption[] = [
  { value: 'rating',  label: 'Your rating' },
  { value: 'recent',  label: 'Date rated' },
  { value: 'release', label: 'Release date' },
  { value: 'title',   label: 'Title' },
];

const DEFAULT_REFINE: RefineValue = { sortField: 'recent', sortDir: 'desc', type: 'any', genre: 'any' };

interface Meta {
  title?: string; poster?: string; year?: string; releaseDate?: string;
  tmdbRating?: number; genre?: string; type?: 'movie' | 'show'; showType?: string;
  isEpisode?: boolean; runtime?: number; showName?: string;
  seasonNumber?: number; episodeNumber?: number;
}

// One row in the list. A show is always ONE row no matter how many of its
// episodes were rated; the series rating and the episode average are carried
// separately and never merged.
interface RatedItem {
  id: string;
  title: string;
  poster: string;
  year: string;
  releaseDate?: string;
  tmdbRating?: number;
  /** What the user gave this title itself. Undefined for an episode-only show. */
  userRating?: number;
  /** Set only on a show row where episodes were rated. */
  episodeCount?: number;
  episodeAverage?: number;
  /** Episode rows (the Episodes sub-type view) carry their place in the show. */
  episodeLabel?: string;
  kind: Exclude<TypeFilter, 'any'>;
  genre: string;
}

function readMetaCache(id: string): Meta | null {
  try { return JSON.parse(localStorage.getItem(`meta-${id}`) ?? 'null'); } catch { return null; }
}

function ItemCard({ item }: { item: RatedItem }) {
  // The episode average is deliberately quieter than the series rating: one is
  // what you said, the other is arithmetic done on your behalf.
  const episodeLine = item.episodeCount
    ? `${item.episodeCount} episode${item.episodeCount === 1 ? '' : 's'} rated · avg ${item.episodeAverage}`
    : null;

  return (
    <Link href={`/movie/${item.id}`} className="group flex items-center gap-4 py-3.5">
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
        {item.episodeLabel && (
          <p className="text-xs font-medium text-muted-foreground/90 mb-0.5">{item.episodeLabel}</p>
        )}
        <p className="text-xs text-muted-foreground mb-1.5">{item.year}</p>
        <div className="flex items-center gap-2.5 flex-wrap">
          {item.tmdbRating !== undefined && (
            <div className="flex items-center gap-0.5">
              <span className="text-xs text-yellow-400 font-bold">★</span>
              <span className="text-xs font-bold text-foreground">{item.tmdbRating.toFixed(1)}</span>
            </div>
          )}
          {item.userRating !== undefined && (
            <div className="flex items-center gap-0.5">
              <Star className="h-3 w-3 fill-blue-400 text-blue-400" />
              <span className="text-xs font-bold text-blue-400">{item.userRating}</span>
            </div>
          )}
          <div className="flex items-center gap-1 text-blue-400">
            <Eye className="h-3.5 w-3.5" />
            <span className="text-xs font-semibold">Watched</span>
          </div>
        </div>
        {episodeLine && (
          <p className="text-[11px] text-muted-foreground/70 mt-1">{episodeLine}</p>
        )}
        {/* Same timestamp the "Date rated" sort uses, so the order is legible.
            getRatedAt, not getAddedAt: this line says "Rated on", and the add
            index answers a different question — when the title first arrived. */}
        {(() => {
          const t = getRatedAt(item.id);
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
  const [raw, setRaw]               = useState<{ id: string; score: number }[]>([]);
  const [metaMap, setMetaMap]       = useState<Map<string, Meta>>(new Map());
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [refineOpen, setRefineOpen] = useState(false);
  // Server-safe defaults; both restored from localStorage after mount.
  const [refine, setRefine]         = useState<RefineValue>(DEFAULT_REFINE);
  const [side, setSide]             = useState<MediaSide>('movies');
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
    try {
      const savedSide = localStorage.getItem('ratings-side');
      if (savedSide === 'movies' || savedSide === 'shows') setSide(savedSide);
    } catch { /* ignore */ }
    // Re-read after login sync restores the account's saved sort into localStorage.
    window.addEventListener('cinephilers-db-restored', readRefine);
    return () => window.removeEventListener('cinephilers-db-restored', readRefine);
  }, []);

  const changeSide = useCallback((next: MediaSide) => {
    setSide(next);
    try { localStorage.setItem('ratings-side', next); } catch { /* ignore */ }
    // A type filter only exists on one side; carrying it across would empty the
    // other side with no visible cause.
    setRefine(prev => (prev.type !== 'any' ? { ...prev, type: 'any' } : prev));
  }, []);

  // Read the ?rating=N param reactively. The page doesn't remount when only the
  // query changes (same route segment), so a useState initializer would go stale.
  useEffect(() => {
    const v = searchParams.get('rating');
    const n = v ? parseInt(v, 10) : NaN;
    setRatingFilter(Number.isFinite(n) && n >= 1 && n <= 10 ? n : null);
  }, [searchParams]);

  useEffect(() => {
    const load = () => {
      normalizeLocalMediaIds();
      const entries: { id: string; score: number }[] = [];
      const cached = new Map<string, Meta>();
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)!;
        if (!k.startsWith('movie-rating-')) continue;
        const score = Number(localStorage.getItem(k));
        if (!score) continue;
        const id = k.slice('movie-rating-'.length);
        entries.push({ id, score });
        const m = readMetaCache(id);
        if (m) cached.set(id, m);
      }
      setRaw(entries);
      setMetaMap(prev => {
        const next = new Map(prev);
        for (const [id, m] of cached) if (!next.has(id)) next.set(id, m);
        return next;
      });
      setLoading(false);
    };
    load();
    // Re-load once the login sync finishes writing DB ratings into localStorage
    window.addEventListener('cinephilers-db-restored', load);
    return () => window.removeEventListener('cinephilers-db-restored', load);
  }, []);

  // ─── Collapse: one row per title, shows folded ─────────────────────────────

  const rows = useMemo(() => collapseRatings(raw), [raw]);

  // Every id the list may need to render: the collapsed rows, plus the episodes
  // themselves for the Episodes view. A show rated only through its episodes has
  // no cached meta of its own, so it has to be fetched before it can be titled.
  useEffect(() => {
    const wanted = new Set<string>();
    for (const row of rows) {
      wanted.add(row.id);
      if (row.isShow) for (const memberId of row.memberIds) wanted.add(memberId);
    }
    const missing = [...wanted].filter(id => !metaMap.has(id) && !fetchingRef.current.has(id));
    if (missing.length === 0) return;
    missing.forEach(id => fetchingRef.current.add(id));
    (async () => {
      const fetched = await batchFetchMeta(missing);
      setMetaMap(prev => {
        const next = new Map(prev);
        for (const [id, m] of Object.entries(fetched)) if (m?.title) next.set(id, m as Meta);
        return next;
      });
    })();
  }, [rows, metaMap]);

  const kindOf = useCallback((id: string, isShow: boolean): Exclude<TypeFilter, 'any'> => {
    const meta = metaMap.get(id);
    if (meta) return getItemType(meta);
    return isShow ? 'tv-series' : 'movie';
  }, [metaMap]);

  // The Episodes sub-type is the release valve: collapsed by default, but pick
  // TV Episode on the Shows side and the list becomes the episodes themselves.
  const showingEpisodes = side === 'shows' && refine.type === 'tv-episode';

  const toItem = useCallback((row: CollapsedRating): RatedItem => {
    const meta = metaMap.get(row.id);
    return {
      id: row.id,
      title: meta?.title ?? '',
      poster: meta?.poster ?? '',
      year: meta?.year ?? '',
      releaseDate: meta?.releaseDate,
      tmdbRating: meta?.tmdbRating,
      userRating: row.seriesRating,
      episodeCount: row.episodeCount || undefined,
      episodeAverage: row.episodeAverage,
      kind: kindOf(row.id, row.isShow),
      genre: meta?.genre ?? '',
    };
  }, [metaMap, kindOf]);

  const items = useMemo<RatedItem[]>(() => {
    if (showingEpisodes) {
      const out: RatedItem[] = [];
      const scoreById = new Map(raw.map(r => [r.id, r.score]));
      for (const row of rows) {
        if (!row.isShow) continue;
        for (const memberId of row.memberIds) {
          if (memberId === row.id) continue; // the series rating, not an episode
          const meta = metaMap.get(memberId);
          const season = meta?.seasonNumber;
          const episode = meta?.episodeNumber;
          out.push({
            id: memberId,
            title: meta?.title?.replace(/^S\d+E\d+\s·\s/, '') ?? '',
            poster: meta?.poster ?? '',
            year: meta?.year ?? '',
            releaseDate: meta?.releaseDate,
            tmdbRating: meta?.tmdbRating,
            userRating: scoreById.get(memberId),
            episodeLabel: season !== undefined && episode !== undefined
              ? `S${season}·E${episode}${meta?.showName ? ` · ${meta.showName}` : ''}`
              : undefined,
            kind: 'tv-episode',
            genre: meta?.genre ?? '',
          });
        }
      }
      return out;
    }
    return rows.map(toItem);
  }, [rows, toItem, showingEpisodes, raw, metaMap]);

  // ─── Movies / Shows split ──────────────────────────────────────────────────

  const sideCounts = useMemo(() => {
    let movies = 0, shows = 0;
    for (const row of rows) (sideOf(kindOf(row.id, row.isShow)) === 'shows' ? shows++ : movies++);
    return { movies, shows };
  }, [rows, kindOf]);

  const episodeRatingTotal = useMemo(
    () => rows.reduce((n, r) => n + r.episodeCount, 0),
    [rows],
  );

  const sideItems = useMemo(
    // The Episodes view is already show-side only, so it needs no further split.
    () => (showingEpisodes ? items : items.filter(i => sideOf(i.kind as Exclude<TypeFilter, 'any'>) === side)),
    [items, side, showingEpisodes],
  );

  // ─── Filter options ────────────────────────────────────────────────────────

  const typeOptions = useMemo<CountOption[]>(() => {
    const withTitle = items.filter(i => i.title);
    const counts = new Map<TypeFilter, number>();
    for (const it of withTitle) {
      if (sideOf(it.kind) !== side) continue;
      counts.set(it.kind, (counts.get(it.kind) ?? 0) + 1);
    }
    // Episodes are counted from the collapsed rows, since in the default view
    // they aren't items at all — but the option has to be offered to reach them.
    if (side === 'shows') counts.set('tv-episode', episodeRatingTotal);
    const total = side === 'shows' ? sideCounts.shows : sideCounts.movies;
    return [
      { value: 'any', label: 'Any', count: total },
      ...SIDE_TYPES[side].map(t => ({ value: t, label: TYPE_LABELS[t], count: counts.get(t) ?? 0 })),
    ];
  }, [items, side, episodeRatingTotal, sideCounts]);

  const genreOptions = useMemo<CountOption[]>(() => {
    const counts = new Map<string, number>();
    for (const it of sideItems) {
      if (!it.title) continue;
      for (const g of it.genre.split(',').map(s => s.trim()).filter(Boolean)) counts.set(g, (counts.get(g) ?? 0) + 1);
    }
    const entries = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (entries.length === 0) return [];
    return [
      { value: 'any', label: 'Any', count: sideItems.length },
      ...entries.map(([g, c]) => ({ value: g, label: g, count: c })),
    ];
  }, [sideItems]);

  // ─── Sort + filter ─────────────────────────────────────────────────────────

  // What a row sorts and filters by — mirrors effectiveScore in lib/collapse-ratings.
  // A show rated only through its episodes would otherwise count as unrated and
  // sink to the bottom of every sort.
  const scoreOf = (it: RatedItem): number | undefined => it.userRating ?? it.episodeAverage;

  const sortedFiltered = useMemo(() => {
    let result = sideItems.filter(i => i.title);
    if (ratingFilter !== null) result = result.filter(i => scoreOf(i) === ratingFilter);
    // 'tv-episode' already switched the whole list over, so it isn't a filter here.
    if (refine.type !== 'any' && refine.type !== 'tv-episode') result = result.filter(i => i.kind === refine.type);
    if (refine.genre !== 'any') result = result.filter(i => i.genre.split(',').map(s => s.trim()).includes(refine.genre));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(i => i.title.toLowerCase().includes(q));
    }

    if (refine.sortField === 'rating') {
      // Title tie-break: same-score items would otherwise reshuffle across
      // login syncs (localStorage rebuild order is arbitrary).
      result.sort((a, b) => ((scoreOf(b) ?? 0) - (scoreOf(a) ?? 0)) || a.title.localeCompare(b.title));
      if (refine.sortDir === 'asc') result.reverse();
    } else if (refine.sortField === 'title') {
      result.sort((a, b) => a.title.localeCompare(b.title));
      if (refine.sortDir === 'desc') result.reverse();
    } else if (refine.sortField === 'release') {
      const ts = (it: RatedItem): number | null => {
        const rawDate = it.releaseDate || (/^\d{4}$/.test(it.year) ? `${it.year}-01-01` : '');
        const t = rawDate ? Date.parse(rawDate) : NaN;
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
      result.sort((a, b) => (getRatedAt(b.id) - getRatedAt(a.id)) || a.title.localeCompare(b.title));
      if (refine.sortDir === 'asc') result.reverse();
    }
    return result;
  }, [sideItems, refine, search, ratingFilter]);

  const unit = showingEpisodes ? 'episode' : side === 'shows' ? 'show' : 'title';

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

      {/* Movies | Shows */}
      <div className="px-6 pt-4">
        <MediaToggle value={side} onChange={changeSide} counts={sideCounts} />
      </div>

      {/* Search */}
      <div className="px-6 pt-3 pb-3">
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
          {sortedFiltered.length} {unit}{sortedFiltered.length !== 1 ? 's' : ''} · {SORT_OPTIONS.find(s => s.value === refine.sortField)?.label}
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
              <div className="w-20 aspect-[2/3] bg-muted rounded-lg animate-pulse shrink-0" />
              <div className="flex-1 space-y-2 py-1">
                <div className="h-4 bg-muted rounded animate-pulse w-2/3" />
                <div className="h-3 bg-muted rounded animate-pulse w-1/3" />
                <div className="h-3 bg-muted rounded animate-pulse w-1/4" />
              </div>
            </div>
          ))}
        </div>
      ) : sortedFiltered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center px-6">
          <Star className="h-12 w-12 text-muted-foreground/20" />
          <p className="text-muted-foreground text-sm">
            {showingEpisodes ? 'No episodes rated yet'
              : side === 'shows' ? 'Rate shows to see them here'
              : 'Rate movies to see them here'}
          </p>
        </div>
      ) : (
        <div className="px-6 divide-y divide-border">
          {sortedFiltered.map(item => <ItemCard key={item.id} item={item} />)}
        </div>
      )}

      <RefineSheet
        open={refineOpen}
        onClose={() => setRefineOpen(false)}
        total={sideItems.filter(i => i.title).length}
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
