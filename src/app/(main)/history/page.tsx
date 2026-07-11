"use client"

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { History, Eye, Search, SlidersHorizontal, X, Trash2, Film, ChevronLeft } from 'lucide-react';
import type { ItemMeta } from '@/app/api/meta/[id]/route';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { persistRefine } from '@/lib/refine-sort';
import { removeFromWatchLog } from '@/lib/badges';
import { legacyTwin, normalizeLocalMediaIds, getWatchedAtISO, getManualWatchISO } from '@/lib/media-id';
import { batchFetchMeta } from '@/lib/meta-batch';
import { getItemType, TYPE_LABELS, TYPE_ORDER, type TypeFilter } from '@/lib/media-type';
import { RefineSheet, type RefineValue, type SortOption, type CountOption } from '@/components/refine-sheet';

// ─── Refine config ──────────────────────────────────────────────────────────

const SORT_OPTIONS: SortOption[] = [
  { value: 'date',    label: 'Date watched' },
  { value: 'release', label: 'Release date' },
  { value: 'title',   label: 'Title' },
];

const DEFAULT_REFINE: RefineValue = { sortField: 'date', sortDir: 'desc', type: 'any', genre: 'any' };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readAllWatchedIds(): string[] {
  const ids = new Set<string>();
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (k.startsWith('watched-') && !k.startsWith('watched-ep-') && localStorage.getItem(k) === 'true') {
        ids.add(k.slice('watched-'.length));
      }
      if (k.startsWith('watched-ep-')) {
        // Keep the full episode ID: e.g. tmdb-tv-299167-S1E2
        ids.add(k.slice('watched-ep-'.length));
      }
    }
  } catch { /* ignore */ }
  return [...ids];
}

function readLoggedAt(id: string, log: { id: string; loggedAt: string }[]): string {
  const entry = log
    .filter(e => e.id === id || e.id.startsWith(id + '-'))
    .sort((a, b) => new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime())[0];
  // Shows and DB-synced items aren't in the movie watch-log; fall back to the
  // watched-at index so they still sort by date instead of sinking to 1970.
  return entry?.loggedAt ?? getWatchedAtISO(id) ?? new Date(0).toISOString();
}

// Newest-first ordering with a top tier for titles marked watched IN THE APP.
// Hand-marked items always sort above imported ones (whose Letterboxd log-dates
// can be "today" and would otherwise bury genuine taps). `dateFor` supplies the
// fallback watch date for the import tier.
function recencyCompare(a: string, b: string, dateFor: (id: string) => string): number {
  const am = getManualWatchISO(a);
  const bm = getManualWatchISO(b);
  if (am && !bm) return -1;
  if (!am && bm) return 1;
  // Id tie-break: bulk-imported items share one timestamp, and without a
  // deterministic tie-break their order reshuffles on every login sync.
  if (am && bm) return (new Date(bm).getTime() - new Date(am).getTime()) || a.localeCompare(b);
  return (new Date(dateFor(b)).getTime() - new Date(dateFor(a)).getTime()) || a.localeCompare(b);
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

function formatAddedDate(iso: string): string {
  if (!iso || iso === new Date(0).toISOString()) return '';
  try {
    const d = new Date(iso);
    return `Added on ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  } catch { return ''; }
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function HistoryCard({ id, meta, userRating, addedAt, onRemove }: {
  id: string;
  meta: ItemMeta | undefined;
  userRating: number | undefined;
  addedAt: string;
  onRemove: () => void;
}) {
  if (!meta) {
    return (
      <div className="flex items-center gap-4 py-3.5">
        <div className="w-16 aspect-[2/3] bg-muted rounded-lg animate-pulse shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-muted rounded animate-pulse w-2/3" />
          <div className="h-3 bg-muted rounded animate-pulse w-1/3" />
          <div className="h-3 bg-muted rounded animate-pulse w-1/2" />
        </div>
      </div>
    );
  }

  const dateStr = formatAddedDate(addedAt);
  const linkId = meta.showId ?? id;
  const mediaType = meta.type === 'show' ? 'SHOW' : 'MOVIE';

  // Episode display: clean title + "S1·E1 ShowName" subtitle.
  const idEpMatch = id.match(/-S(\d+)E(\d+)$/);
  const isEpisode = meta.isEpisode || !!idEpMatch;
  // Strip any stale "S1E1 · " prefix from cached titles
  const displayTitle = meta.title.replace(/^S\d+E\d+\s·\s/, '');
  const epSeason = meta.seasonNumber ?? (idEpMatch ? parseInt(idEpMatch[1], 10) : undefined);
  const epNumber = meta.episodeNumber ?? (idEpMatch ? parseInt(idEpMatch[2], 10) : undefined);
  const epSubtitle = isEpisode && epSeason !== undefined && epNumber !== undefined
    ? `S${epSeason}·E${epNumber}${meta.showName ? ` · ${meta.showName}` : ''}`
    : null;

  const handleRemove = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const epMatch = id.match(/^(tmdb-tv-\d+)-S(\d+)E(\d+)$/);
    // Await the server delete(s). A failed delete leaves the DB row alive, which the
    // next DB→local sync resurrects — so we only drop it from the UI once the server
    // confirms. On failure we surface it and leave the row in place.
    const ensureOk = async (res: Response) => { if (!res.ok) throw new Error(`delete failed: ${res.status}`); };
    try {
      if (epMatch) {
        // Episode: clean the local key, the per-show index, and the watch-log,
        // then delete on the server via the episodes endpoint. Hitting /api/watched
        // here (the movie endpoint) left the DB record alive, so it re-synced back.
        const [, showId, sStr, eStr] = epMatch;
        const season = parseInt(sStr, 10);
        const episode = parseInt(eStr, 10);
        const epKey = `S${season}E${episode}`;
        try {
          localStorage.removeItem(`watched-ep-${id}`);
          // Phantom key from an earlier sync bug that stored episode ids as watched-<id>
          localStorage.removeItem(`watched-${id}`);
          const idxRaw = localStorage.getItem(`watched-eps-index-${showId}`);
          if (idxRaw) {
            const idx = JSON.parse(idxRaw) as string[];
            localStorage.setItem(`watched-eps-index-${showId}`, JSON.stringify(idx.filter(k => k !== epKey)));
          }
        } catch { /* ignore */ }
        removeFromWatchLog(id, 'episode');
        await fetchWithAuth('/api/watched/episodes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ showTmdbId: showId, season, episode, watched: false }),
        }).then(ensureOk);
        // Remove any phantom row this episode left in the movie/show watched table.
        // deleteMany returns OK even when there's no such row, so confirming this only
        // trips on a real network/server failure — which we want to surface, since a
        // silently-failed delete lets the phantom resync back into history.
        await fetchWithAuth(`/api/watched/${id}?mediaType=SHOW`, { method: 'DELETE' }).then(ensureOk);
      } else {
        // Movie or whole show.
        try { localStorage.removeItem(`watched-${id}`); } catch { /* ignore */ }
        removeFromWatchLog(id, 'movie');
        await fetchWithAuth(`/api/watched/${id}?mediaType=${mediaType}`, { method: 'DELETE' }).then(ensureOk);
        // Also clear any legacy bare-numeric twin (older imports stored "262504" instead
        // of "tmdb-262504"); without this, the leftover row syncs back as a duplicate.
        // Confirm it too — deleteMany is a no-op when there's no twin, so this only
        // throws on a genuine failure that would otherwise resurrect the duplicate.
        const twin = legacyTwin(id);
        if (twin) {
          try { localStorage.removeItem(`watched-${twin}`); } catch { /* ignore */ }
          removeFromWatchLog(twin, 'movie');
          await fetchWithAuth(`/api/watched/${twin}?mediaType=${mediaType}`, { method: 'DELETE' }).then(ensureOk);
        }
      }
    } catch {
      alert("Couldn't delete this on the server — please check your connection and try again.");
      return;
    }
    onRemove();
  };

  return (
    <Link href={`/movie/${linkId}`} className="group relative flex items-center gap-4 py-3.5">
      {/* Thumbnail */}
      <div className="relative w-16 aspect-[2/3] overflow-hidden rounded-lg bg-muted shadow-md shrink-0">
        {meta.poster ? (
          <img
            src={meta.poster}
            alt={meta.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted">
            <Film className="h-7 w-7 text-primary/60" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold font-headline line-clamp-2 group-hover:text-primary transition-colors leading-snug mb-0.5">
          {displayTitle}
        </h3>
        {epSubtitle && (
          <p className="text-xs font-medium text-muted-foreground/90 mb-0.5">{epSubtitle}</p>
        )}
        <p className="text-xs text-muted-foreground mb-1.5">{meta.year}</p>
        <div className="flex items-center gap-2.5 flex-wrap">
          {meta.tmdbRating !== undefined && (
            <div className="flex items-center gap-0.5">
              <span className="text-xs text-yellow-400 font-bold">★</span>
              <span className="text-xs font-bold text-foreground">{meta.tmdbRating.toFixed(1)}</span>
            </div>
          )}
          {userRating !== undefined && (
            <div className="flex items-center gap-0.5">
              <span className="text-xs text-blue-400 font-bold">★</span>
              <span className="text-xs font-bold text-blue-400">{userRating}</span>
            </div>
          )}
          <div className="flex items-center gap-1 text-blue-400">
            <Eye className="h-3.5 w-3.5" />
            <span className="text-xs font-semibold">Watched</span>
          </div>
        </div>
        {dateStr && (
          <p className="text-[10px] text-muted-foreground/60 mt-1">{dateStr}</p>
        )}
      </div>

      {/* Delete button */}
      <button
        onClick={handleRemove}
        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-2 rounded-full hover:bg-red-500/20 text-muted-foreground hover:text-red-400"
        aria-label={`Remove ${meta.title} from history`}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────


export default function HistoryPage() {
  const router = useRouter();
  const [allIds, setAllIds]           = useState<string[]>([]);
  const [metaMap, setMetaMap]         = useState<Map<string, ItemMeta>>(new Map());
  const [userRatings, setUserRatings] = useState<Map<string, number>>(new Map());
  const [fetching, setFetching]       = useState(false);
  const [search, setSearch]         = useState('');
  const [refineOpen, setRefineOpen] = useState(false);
  // Server-safe default; the saved refine is restored from localStorage after
  // mount (reading it during render would mismatch the server and break hydration).
  const [refine, setRefine]         = useState<RefineValue>(DEFAULT_REFINE);

  useEffect(() => {
    const readRefine = () => {
      try {
        const saved = localStorage.getItem('history-refine');
        if (saved) setRefine({ ...DEFAULT_REFINE, ...JSON.parse(saved) });
      } catch { /* ignore */ }
    };
    readRefine();
    // Re-read after login sync restores the account's saved sort into localStorage.
    window.addEventListener('cinephilers-db-restored', readRefine);
    return () => window.removeEventListener('cinephilers-db-restored', readRefine);
  }, []);

  const fetchingRef = useRef(new Set<string>());
  const dateMapRef  = useRef(new Map<string, string>());

  const removeId = useCallback((id: string) => {
    setAllIds(prev => prev.filter(x => x !== id));
    setMetaMap(prev => { const next = new Map(prev); next.delete(id); return next; });
    setUserRatings(prev => { const next = new Map(prev); next.delete(id); return next; });
  }, []);

  // ─── Initial load ──────────────────────────────────────────────────────────
  // Reads watched ids + dates from localStorage and (re)sorts newest-first.
  // Runs on mount AND whenever the page becomes visible again — because Next's
  // router cache can serve this page on back/forward WITHOUT remounting, which
  // left a freshly-watched title (just written to localStorage on the movie
  // page) stuck in its old position instead of popping to the top.
  const loadFromStorage = useCallback(() => {
    normalizeLocalMediaIds();
    const ids = readAllWatchedIds();

    let log: { id: string; loggedAt: string }[] = [];
    try { log = JSON.parse(localStorage.getItem('watch-log') ?? '[]'); } catch { /* ignore */ }
    const dm = new Map<string, string>();
    for (const id of ids) dm.set(id, readLoggedAt(id, log));
    dateMapRef.current = dm;

    const ratings = new Map<string, number>();
    for (const id of ids) {
      const r = readUserRating(id);
      if (r !== undefined) ratings.set(id, r);
    }

    const sorted = [...ids].sort((a, b) => recencyCompare(a, b, id => dm.get(id) ?? new Date(0).toISOString()));

    setMetaMap(prev => {
      // Merge any cached meta we don't already hold; keep what we've fetched.
      const next = new Map(prev);
      for (const id of ids) {
        if (!next.has(id)) {
          const m = readMetaCache(id);
          if (m) {
            next.set(id, m);
            // An entry cached before runtime/showType tracking is missing the field
            // its type is classified by — leave it out of the fetched set so the batch
            // fetch refreshes it (movie shorts by runtime, mini-series by showType)
            // instead of staying stuck as plain "movie"/"tv-series".
            const needsRefresh =
              (m.type === 'movie' && !m.isEpisode && m.runtime === undefined) ||
              (m.type === 'show'  && !m.isEpisode && m.showType === undefined);
            if (m.tmdbRating !== undefined && !needsRefresh) fetchingRef.current.add(id);
          }
        }
      }
      return next;
    });
    setUserRatings(ratings);
    setAllIds(sorted);
  }, []);

  useEffect(() => {
    loadFromStorage();

    const onVisible = () => { if (document.visibilityState === 'visible') loadFromStorage(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', loadFromStorage);
    window.addEventListener('cinephilers-db-restored', loadFromStorage);
    window.addEventListener('cinephilers-watched-changed', loadFromStorage);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', loadFromStorage);
      window.removeEventListener('cinephilers-db-restored', loadFromStorage);
      window.removeEventListener('cinephilers-watched-changed', loadFromStorage);
    };
  }, [loadFromStorage]);

  // ─── Fetch metadata for all IDs in batches ────────────────────────────────

  useEffect(() => {
    if (allIds.length === 0) return;
    const toFetch = allIds.filter(id => !fetchingRef.current.has(id));
    if (toFetch.length === 0) return;
    toFetch.forEach(id => fetchingRef.current.add(id));
    setFetching(true);

    const runBatches = async () => {
      const fetched = await batchFetchMeta(toFetch);
      for (const [id, m] of Object.entries(fetched)) writeMetaCache(id, m);
      setMetaMap(prev => {
        const next = new Map(prev);
        for (const [id, m] of Object.entries(fetched)) next.set(id, m);
        return next;
      });
      setFetching(false);
    };

    runBatches();
  }, [allIds]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Rating listener ───────────────────────────────────────────────────────

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

  // ─── Type counts ───────────────────────────────────────────────────────────

  // Per-type counts → options for the Type filter (only kinds actually present).
  const typeOptions = useMemo<CountOption[]>(() => {
    const counts = new Map<TypeFilter, number>();
    for (const [, meta] of metaMap) {
      const t = getItemType(meta);
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    const present = TYPE_ORDER.filter(t => t !== 'any' && (counts.get(t) ?? 0) > 0);
    if (present.length === 0) return [];
    return [
      { value: 'any', label: TYPE_LABELS.any, count: allIds.length },
      ...present.map(t => ({ value: t, label: TYPE_LABELS[t], count: counts.get(t)! })),
    ];
  }, [allIds.length, metaMap]);

  // Per-genre counts, most common first.
  const genreOptions = useMemo<CountOption[]>(() => {
    const counts = new Map<string, number>();
    for (const [, meta] of metaMap) {
      for (const g of (meta.genre ?? '').split(',').map(s => s.trim()).filter(Boolean)) {
        counts.set(g, (counts.get(g) ?? 0) + 1);
      }
    }
    const entries = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (entries.length === 0) return [];
    return [
      { value: 'any', label: 'Any', count: allIds.length },
      ...entries.map(([g, c]) => ({ value: g, label: g, count: c })),
    ];
  }, [allIds.length, metaMap]);

  // ─── Sort + filter ─────────────────────────────────────────────────────────

  const sortedFilteredIds = useMemo(() => {
    let ids = [...allIds];

    if (refine.type !== 'any') {
      ids = ids.filter(id => {
        const meta = metaMap.get(id);
        return meta ? getItemType(meta) === refine.type : false;
      });
    }
    if (refine.genre !== 'any') {
      ids = ids.filter(id => (metaMap.get(id)?.genre ?? '').split(',').map(s => s.trim()).includes(refine.genre));
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      ids = ids.filter(id => (metaMap.get(id)?.title ?? '').toLowerCase().includes(q));
    }

    if (refine.sortField === 'title') {
      ids.sort((a, b) => (metaMap.get(a)?.title ?? '').localeCompare(metaMap.get(b)?.title ?? ''));
      if (refine.sortDir === 'desc') ids.reverse();
    } else if (refine.sortField === 'release') {
      // Full release-date timestamp; falls back to Jan 1 of the year, null when unknown.
      const ts = (id: string): number | null => {
        const m = metaMap.get(id);
        const raw = m?.releaseDate || (m && /^\d{4}$/.test(m.year) ? `${m.year}-01-01` : '');
        const t = raw ? Date.parse(raw) : NaN;
        return Number.isNaN(t) ? null : t;
      };
      const dir = refine.sortDir === 'desc' ? -1 : 1;
      ids.sort((a, b) => {
        const ta = ts(a), tb = ts(b);
        if (ta === null && tb === null) return 0;
        if (ta === null) return 1;   // unknown date sinks to the bottom
        if (tb === null) return -1;
        return (ta - tb) * dir;
      });
    } else {
      // Date watched. Newest-first tiers hand-marked titles above imports (whose
      // log-dates can be "today"); oldest-first is a plain ascending date sort.
      if (refine.sortDir === 'desc') {
        ids.sort((a, b) => recencyCompare(a, b, id => dateMapRef.current.get(id) ?? new Date(0).toISOString()));
      } else {
        ids.sort((a, b) => (new Date(dateMapRef.current.get(a) ?? 0).getTime() - new Date(dateMapRef.current.get(b) ?? 0).getTime()) || a.localeCompare(b));
      }
    }

    return ids;
  }, [allIds, refine, search, metaMap]);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <main className="pb-32">
      {/* Header — back arrow matters in the installed PWA, where there's no browser back button */}
      <div className="px-6 pt-12 pb-4">
        <div className="flex items-center gap-2 mb-0.5">
          <button onClick={() => router.back()} aria-label="Go back" className="rounded-full p-1 -ml-2 hover:bg-muted/60 transition-colors">
            <ChevronLeft className="h-6 w-6" />
          </button>
          <h1 className="text-3xl font-headline font-bold">Watch History</h1>
        </div>
        <p className="text-muted-foreground text-sm">
          {allIds.length} Title{allIds.length !== 1 ? 's' : ''}
          {fetching && <span className="ml-2 opacity-50">loading…</span>}
        </p>
      </div>

      {/* Search bar */}
      <div className="px-6 pb-3">
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

      {/* Sorted by + Refine button */}
      <div className="px-6 pb-4 flex items-center justify-between">
        <p className="text-xs text-muted-foreground truncate">
          {sortedFilteredIds.length} title{sortedFilteredIds.length !== 1 ? 's' : ''} · {SORT_OPTIONS.find(s => s.value === refine.sortField)?.label}
          {refine.type !== 'any' && ` · ${TYPE_LABELS[refine.type as TypeFilter]}`}
          {refine.genre !== 'any' && ` · ${refine.genre}`}
        </p>
        <button
          onClick={() => setRefineOpen(true)}
          className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:opacity-80 transition-opacity shrink-0"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Refine
        </button>
      </div>

      {/* List */}
      {allIds.length === 0 && !fetching ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center px-6">
          <History className="h-12 w-12 text-muted-foreground/20" />
          <p className="text-muted-foreground text-sm">Nothing here yet</p>
        </div>
      ) : (
        <div className="px-6">
          <div className="divide-y divide-border">
            {sortedFilteredIds.map(id => (
              <HistoryCard
                key={id}
                id={id}
                meta={metaMap.get(id)}
                userRating={userRatings.get(id)}
                addedAt={dateMapRef.current.get(id) ?? ''}
                onRemove={() => removeId(id)}
              />
            ))}
          </div>
        </div>
      )}

      <RefineSheet
        open={refineOpen}
        onClose={() => setRefineOpen(false)}
        total={allIds.length}
        sortOptions={SORT_OPTIONS}
        typeOptions={typeOptions}
        genreOptions={genreOptions}
        value={refine}
        onApply={v => {
          setRefine(v);
          persistRefine('history-refine', v);
        }}
      />
    </main>
  );
}
