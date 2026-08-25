"use client"

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { History, Search, SlidersHorizontal, X, Trash2, Film, ChevronLeft } from 'lucide-react';
import type { ItemMeta } from '@/app/api/meta/[id]/route';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { persistRefine } from '@/lib/refine-sort';
import { removeFromWatchLog } from '@/lib/watch-log';
import { legacyTwin, normalizeLocalMediaIds, getWatchedAtISO, getManualWatchISO } from '@/lib/media-id';
import { batchFetchMeta, isStaleMeta, type CachedMeta } from '@/lib/meta-batch';
import { getItemType, sideOf, SIDE_TYPES, TYPE_LABELS, type TypeFilter, type MediaSide } from '@/lib/media-type';
import { collapseShows, type CollapsedRow } from '@/lib/collapse-shows';
import { MediaToggle } from '@/components/media-toggle';
import { RefineSheet, type RefineValue, type SortOption, type CountOption } from '@/components/refine-sheet';
import { WatchedEye } from '@/components/watched-eye';
import { useCommunityRatings } from '@/hooks/use-community-ratings';

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
// can be "today" and would otherwise bury genuine taps). A collapsed show counts
// as hand-marked if ANY of its episodes was — ticking one episode of an imported
// show should lift the whole row, since the row is the thing you're working through.
function rowRecencyCompare(a: CollapsedRow, b: CollapsedRow, manualFor: (r: CollapsedRow) => string | null): number {
  const am = manualFor(a);
  const bm = manualFor(b);
  if (am && !bm) return -1;
  if (!am && bm) return 1;
  // Id tie-break: bulk-imported items share one timestamp, and without a
  // deterministic tie-break their order reshuffles on every login sync.
  if (am && bm) return (new Date(bm).getTime() - new Date(am).getTime()) || a.id.localeCompare(b.id);
  return (new Date(b.watchedAt).getTime() - new Date(a.watchedAt).getTime()) || a.id.localeCompare(b.id);
}

// CachedMeta, not ItemMeta: entries carry the stamp that says how old they are,
// and it has to survive being read here and written back below.
function readMetaCache(id: string): CachedMeta | null {
  try { return JSON.parse(localStorage.getItem(`meta-${id}`) ?? 'null'); }
  catch { return null; }
}

function writeMetaCache(id: string, m: CachedMeta) {
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

// Forget one episode locally: its key, the phantom watched-<id> an old sync bug
// left behind, its entry in the per-show index, and its watch-log line.
function forgetEpisodeLocally(epId: string, showId: string, season: number, episode: number) {
  try {
    localStorage.removeItem(`watched-ep-${epId}`);
    localStorage.removeItem(`watched-${epId}`);
    const idxRaw = localStorage.getItem(`watched-eps-index-${showId}`);
    if (idxRaw) {
      const idx = JSON.parse(idxRaw) as string[];
      localStorage.setItem(`watched-eps-index-${showId}`, JSON.stringify(idx.filter(k => k !== `S${season}E${episode}`)));
    }
  } catch { /* ignore */ }
  removeFromWatchLog(epId, 'episode');
}

const EP_ID = /^(.+)-S(\d+)E(\d+)$/;

// ─── Card ─────────────────────────────────────────────────────────────────────

function HistoryCard({ row, meta, userRating, onRemove }: {
  row: CollapsedRow;
  meta: ItemMeta | undefined;
  userRating: number | undefined;
  onRemove: (ids: string[]) => void;
}) {
  const id = row.id;
  // Above the early return below: hooks cannot be called conditionally.
  const cine = useCommunityRatings([id]);
  const community = cine[id];
  // Not resolveDisplayRating here. This row deliberately prints 0.0 for a
  // released title with no votes — see the note by the star — and that helper
  // treats 0 as nothing to show. Same threshold rule, the row's own zero rule.
  const useCine = !!(community?.hasEnough && typeof community.average === 'number' && community.average > 0);
  const shownRating = useCine ? community!.average! : meta?.tmdbRating;

  if (!meta) {
    return (
      <div className="flex items-center gap-4 py-3.5">
        <div className="w-20 aspect-[2/3] bg-muted rounded-lg animate-pulse shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-muted rounded animate-pulse w-2/3" />
          <div className="h-3 bg-muted rounded animate-pulse w-1/3" />
          <div className="h-3 bg-muted rounded animate-pulse w-1/2" />
        </div>
      </div>
    );
  }

  const dateStr = formatAddedDate(row.watchedAt);
  const mediaType = meta.type === 'show' ? 'SHOW' : 'MOVIE';
  // Strip any stale "S1E1 · " prefix from cached titles
  const displayTitle = meta.title.replace(/^S\d+E\d+\s·\s/, '');

  // A collapsed show is one row for the whole series: progress instead of an
  // episode subtitle, and a status label once you're all the way through.
  // Progress only once episodes have actually been ticked — a show record from
  // before Step 2 has none, and "0 / 62 episodes" reads as a bug rather than as
  // a whole-show mark.
  // Compact, because it now sits beside the eye rather than on a line of its
  // own: the eye already says these are episodes watched, so repeating the word
  // there would only push the row wider.
  const progress = row.isShow && row.watchedEpisodes > 0
    ? (row.totalEpisodes > 0
        ? `${row.watchedEpisodes} / ${row.totalEpisodes}`
        : `${row.watchedEpisodes} episode${row.watchedEpisodes === 1 ? '' : 's'}`)
    : null;
  // Only "Up to date" is left to say: a finished show is the count and a filled
  // eye, which needs no word.
  const statusLabel = row.status === 'up-to-date' ? 'Up to date' : null;

  // No release date at all means an older title whose date TMDB never carried —
  // treat that as out, since the alternative is hiding scores on old films.
  const isReleased = !meta.releaseDate || new Date(meta.releaseDate).getTime() <= Date.now();

  const removeShow = async (ensureOk: (res: Response) => Promise<void>) => {
    // Every episode this row folds in, plus the show's own watched record when
    // one exists (whole-show marks still write it). One bulk request, not one
    // per episode — unmarking Naruto would otherwise be 220 round trips.
    const eps: { season: number; episode: number }[] = [];
    for (const memberId of row.memberIds) {
      const m = EP_ID.exec(memberId);
      if (m) eps.push({ season: parseInt(m[2], 10), episode: parseInt(m[3], 10) });
    }
    if (eps.length > 0) {
      for (const memberId of row.memberIds) {
        const m = EP_ID.exec(memberId);
        if (m) forgetEpisodeLocally(memberId, id, parseInt(m[2], 10), parseInt(m[3], 10));
      }
      await fetchWithAuth('/api/watched/episodes/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ showTmdbId: id, episodes: eps, watched: false }),
      }).then(ensureOk);
    }
    // The show's own row: deleteMany is a no-op when there isn't one, so this is
    // safe either way and still surfaces a genuine network failure.
    try { localStorage.removeItem(`watched-${id}`); } catch { /* ignore */ }
    removeFromWatchLog(id, 'movie');
    await fetchWithAuth(`/api/watched/${id}?mediaType=SHOW`, { method: 'DELETE' }).then(ensureOk);
  };

  const handleRemove = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (row.isShow && row.watchedEpisodes > 0) {
      const count = row.watchedEpisodes;
      if (!confirm(`Remove ${displayTitle} from your history? This unmarks ${count} watched episode${count === 1 ? '' : 's'}.`)) return;
    }

    // Await the server delete(s). A failed delete leaves the DB row alive, which the
    // next DB→local sync resurrects — so we only drop it from the UI once the server
    // confirms. On failure we surface it and leave the row in place.
    const ensureOk = async (res: Response) => { if (!res.ok) throw new Error(`delete failed: ${res.status}`); };
    try {
      if (row.isShow) {
        await removeShow(ensureOk);
      } else {
        // Movie.
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
    onRemove(row.memberIds);
  };

  return (
    <Link href={`/movie/${id}`} className="group relative flex items-center gap-4 py-3.5">
      {/* Thumbnail */}
      <div className="relative w-20 aspect-[2/3] overflow-hidden rounded-lg bg-muted shadow-md shrink-0">
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
        <p className="text-xs text-muted-foreground mb-1.5">{meta.year}</p>
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* 0.0 is kept for anything that's OUT: an obscure 1985 series really
              does have no votes, and a missing star there is ambiguous — you
              can't tell "nobody rated it" from "this is broken". A film that
              isn't released yet is a different case: it has no score because it
              cannot have one, and printing 0.0 states a verdict on something
              nobody has seen. */}
          {shownRating !== undefined && isReleased && (
            <div className="flex items-center gap-0.5">
              <span className={`text-xs font-bold ${useCine ? 'text-primary' : 'text-yellow-400'}`}>★</span>
              <span className="text-xs font-bold text-foreground">{shownRating.toFixed(1)}</span>
            </div>
          )}
          {userRating !== undefined && (
            <div className="flex items-center gap-0.5">
              <span className="text-xs text-primary font-bold">☆</span>
              <span className="text-xs font-bold text-primary">{userRating}</span>
            </div>
          )}
          {/* This was inverted: a show you'd finished got a tick and no eye,
              while one you were a single episode into got the solid eye and the
              word "Watched". The eye follows the same rule as everywhere else —
              filled only when it's finished.
              Both eyes carry the count now, filled or hollow —
              "45 / 62" partway, "62 / 62" finished. A filled eye already says finished,
              so the word would only repeat it. The count used to sit above
              the year, which left the hollow eye standing there labelled with
              nothing at all — an icon whose whole job is "partway through" and no
              word for how far. Up to date rides along with it, since a show you
              are caught up on is still not a show you have finished. */}
          {row.isShow ? (
            row.status === 'completed' ? (
              <div className="flex items-center gap-1 text-primary">
                <WatchedEye state="complete" className="h-3.5 w-3.5" />
                {progress && <span className="text-xs font-semibold">{progress}</span>}
              </div>
            ) : (
              <div className="flex items-center gap-1 text-primary">
                <WatchedEye state="partial" className="h-3.5 w-3.5" />
                {(progress || statusLabel) && (
                  <span className="text-xs font-semibold">
                    {[progress, statusLabel].filter(Boolean).join(' · ')}
                  </span>
                )}
              </div>
            )
          ) : (
            <div className="flex items-center gap-1 text-primary">
              <WatchedEye state="complete" className="h-3.5 w-3.5" />
              <span className="text-xs font-semibold">Watched</span>
            </div>
          )}
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
  // Films and shows are counted and filtered separately, with no combined view.
  // Server-safe default for the same hydration reason as the refine above.
  const [side, setSide]             = useState<MediaSide>('movies');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('history-side');
      if (saved === 'movies' || saved === 'shows') setSide(saved);
    } catch { /* ignore */ }
  }, []);

  const changeSide = useCallback((next: MediaSide) => {
    setSide(next);
    try { localStorage.setItem('history-side', next); } catch { /* ignore */ }
    // A type filter only exists on one side, so carrying it across would filter
    // the other side down to nothing with no visible cause.
    setRefine(prev => (prev.type !== 'any' ? { ...prev, type: 'any' } : prev));
  }, []);

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

  const removeIds = useCallback((ids: string[]) => {
    const gone = new Set(ids);
    setAllIds(prev => prev.filter(x => !gone.has(x)));
    setMetaMap(prev => { const next = new Map(prev); for (const id of gone) next.delete(id); return next; });
    setUserRatings(prev => { const next = new Map(prev); for (const id of gone) next.delete(id); return next; });
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
            // instead of staying stuck as plain "movie"/"tv-series". Episodes cached
            // before totalEps rode along have no episode total, which is what a
            // collapsed show row counts against — refresh those too. And a show
            // whose entry is simply old: its total moves when a new episode airs,
            // so a day-old one is refetched rather than trusted.
            const needsRefresh =
              (m.type === 'movie' && !m.isEpisode && m.runtime === undefined) ||
              (m.type === 'show'  && !m.isEpisode && m.showType === undefined) ||
              (m.isEpisode === true && m.totalEps === undefined) ||
              isStaleMeta(m);
            if (m.tmdbRating !== undefined && !needsRefresh) fetchingRef.current.add(id);
          }
        }
      }
      return next;
    });
    setUserRatings(ratings);
    // Rows are sorted properly below; this ordering is what the meta batch walks,
    // so keeping it newest-first means the top of the list fills in first.
    setAllIds([...ids].sort((a, b) =>
      (new Date(dm.get(b) ?? 0).getTime() - new Date(dm.get(a) ?? 0).getTime()) || a.localeCompare(b)));
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

  // ─── Collapse episodes into one row per show ──────────────────────────────

  const rows = useMemo<CollapsedRow[]>(() => collapseShows(
    allIds.map(id => {
      const m = metaMap.get(id);
      return {
        id,
        showId: m?.showId,
        isEpisode: m?.isEpisode,
        totalEpisodes: m?.totalEps,
        showStatus: m?.tmdbStatus,
        watchedAt: dateMapRef.current.get(id) ?? new Date(0).toISOString(),
      };
    }),
  ), [allIds, metaMap]);

  // A show you're partway through was never marked at show level, so its own
  // meta is in nobody's list — but the row is titled and postered from it.
  // Fetch it once the collapse tells us the show exists.
  useEffect(() => {
    const missing = rows.filter(r => r.isShow && !fetchingRef.current.has(r.id)).map(r => r.id);
    if (missing.length === 0) return;
    missing.forEach(id => fetchingRef.current.add(id));
    (async () => {
      const fetched = await batchFetchMeta(missing);
      for (const [id, m] of Object.entries(fetched)) writeMetaCache(id, m);
      setMetaMap(prev => {
        const next = new Map(prev);
        for (const [id, m] of Object.entries(fetched)) next.set(id, m);
        return next;
      });
    })();
  }, [rows]);

  // Hand-marked timestamp per row, resolved once — the date sort reads it on
  // every comparison and a show row has to scan all its episodes for it.
  const manualMap = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const row of rows) {
      let best: string | null = null;
      for (const memberId of row.memberIds) {
        const iso = getManualWatchISO(memberId);
        if (iso && (!best || iso > best)) best = iso;
      }
      m.set(row.id, best);
    }
    return m;
  }, [rows]);

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

  // ─── Movies / Shows split ──────────────────────────────────────────────────

  // Which side a row belongs to. Meta may not have loaded yet, and a row with no
  // meta would otherwise land on the wrong side and jump when it arrives — but
  // the collapse already knows a show is a show from its id shape alone.
  const sideForRow = useCallback((r: CollapsedRow): MediaSide => {
    const meta = metaMap.get(r.id);
    if (meta) return sideOf(getItemType(meta));
    return r.isShow ? 'shows' : 'movies';
  }, [metaMap]);

  const sideRows = useMemo(() => rows.filter(r => sideForRow(r) === side), [rows, side, sideForRow]);

  const sideCounts = useMemo(() => {
    let movies = 0, shows = 0;
    for (const r of rows) (sideForRow(r) === 'shows' ? shows++ : movies++);
    return { movies, shows };
  }, [rows, sideForRow]);

  // Episodes are the unit of work on the Shows side — seven shows says far less
  // about what you've watched than the episodes under them do.
  const episodeTotal = useMemo(
    () => rows.reduce((n, r) => n + (r.isShow ? r.watchedEpisodes : 0), 0),
    [rows],
  );

  // ─── Type counts ───────────────────────────────────────────────────────────

  // Per-type counts → options for the Type filter, narrowed to this side's own
  // sub-types (Movie / TV Movie / Short, or TV Series / Mini Series / Episode)
  // and to the kinds actually present. Counted per ROW, so a show counts once
  // rather than once per episode.
  const typeOptions = useMemo<CountOption[]>(() => {
    const counts = new Map<TypeFilter, number>();
    for (const row of sideRows) {
      const meta = metaMap.get(row.id);
      if (!meta) continue;
      const t = getItemType(meta);
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    const present = SIDE_TYPES[side].filter(t => (counts.get(t) ?? 0) > 0);
    if (present.length === 0) return [];
    return [
      { value: 'any', label: TYPE_LABELS.any, count: sideRows.length },
      ...present.map(t => ({ value: t, label: TYPE_LABELS[t], count: counts.get(t)! })),
    ];
  }, [sideRows, metaMap, side]);

  // Per-genre counts, most common first.
  const genreOptions = useMemo<CountOption[]>(() => {
    const counts = new Map<string, number>();
    for (const row of sideRows) {
      const meta = metaMap.get(row.id);
      if (!meta) continue;
      for (const g of (meta.genre ?? '').split(',').map(s => s.trim()).filter(Boolean)) {
        counts.set(g, (counts.get(g) ?? 0) + 1);
      }
    }
    const entries = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (entries.length === 0) return [];
    return [
      { value: 'any', label: 'Any', count: sideRows.length },
      ...entries.map(([g, c]) => ({ value: g, label: g, count: c })),
    ];
  }, [sideRows, metaMap]);

  // ─── Sort + filter ─────────────────────────────────────────────────────────

  const sortedFilteredRows = useMemo(() => {
    let list = [...sideRows];

    if (refine.type !== 'any') {
      list = list.filter(r => {
        const meta = metaMap.get(r.id);
        return meta ? getItemType(meta) === refine.type : false;
      });
    }
    if (refine.genre !== 'any') {
      list = list.filter(r => (metaMap.get(r.id)?.genre ?? '').split(',').map(s => s.trim()).includes(refine.genre));
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(r => (metaMap.get(r.id)?.title ?? '').toLowerCase().includes(q));
    }

    if (refine.sortField === 'title') {
      list.sort((a, b) => (metaMap.get(a.id)?.title ?? '').localeCompare(metaMap.get(b.id)?.title ?? ''));
      if (refine.sortDir === 'desc') list.reverse();
    } else if (refine.sortField === 'release') {
      // Full release-date timestamp; falls back to Jan 1 of the year, null when unknown.
      const ts = (r: CollapsedRow): number | null => {
        const m = metaMap.get(r.id);
        const raw = m?.releaseDate || (m && /^\d{4}$/.test(m.year) ? `${m.year}-01-01` : '');
        const t = raw ? Date.parse(raw) : NaN;
        return Number.isNaN(t) ? null : t;
      };
      const dir = refine.sortDir === 'desc' ? -1 : 1;
      list.sort((a, b) => {
        const ta = ts(a), tb = ts(b);
        if (ta === null && tb === null) return 0;
        if (ta === null) return 1;   // unknown date sinks to the bottom
        if (tb === null) return -1;
        return (ta - tb) * dir;
      });
    } else {
      // Date watched. Newest-first tiers hand-marked titles above imports (whose
      // log-dates can be "today"); oldest-first is a plain ascending date sort.
      // A show sits at its most recent episode, so it rises as you watch.
      if (refine.sortDir === 'desc') {
        list.sort((a, b) => rowRecencyCompare(a, b, r => manualMap.get(r.id) ?? null));
      } else {
        list.sort((a, b) => (new Date(a.watchedAt).getTime() - new Date(b.watchedAt).getTime()) || a.id.localeCompare(b.id));
      }
    }

    return list;
  }, [sideRows, refine, search, metaMap, manualMap]);

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
        {/* Counts are split, never mixed — films and shows hold different value. */}
        <p className="text-muted-foreground text-sm">
          {sideCounts.movies} film{sideCounts.movies !== 1 ? 's' : ''} · {episodeTotal} episode{episodeTotal !== 1 ? 's' : ''}
          {fetching && <span className="ml-2 opacity-50">loading…</span>}
        </p>
      </div>

      {/* Movies | Shows */}
      <div className="px-6 pb-3">
        <MediaToggle value={side} onChange={changeSide} counts={sideCounts} />
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
          {sortedFilteredRows.length} {side === 'shows' ? 'show' : 'title'}{sortedFilteredRows.length !== 1 ? 's' : ''}
          {side === 'shows' && episodeTotal > 0 && ` · ${episodeTotal} episode${episodeTotal !== 1 ? 's' : ''}`}
          {' · '}{SORT_OPTIONS.find(s => s.value === refine.sortField)?.label}
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
      {sideRows.length === 0 && !fetching ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center px-6">
          <History className="h-12 w-12 text-muted-foreground/20" />
          <p className="text-muted-foreground text-sm">
            {side === 'shows' ? 'No shows watched yet' : 'No films watched yet'}
          </p>
        </div>
      ) : (
        <div className="px-6">
          <div className="divide-y divide-border">
            {sortedFilteredRows.map(row => (
              <HistoryCard
                key={row.id}
                row={row}
                meta={metaMap.get(row.id)}
                userRating={userRatings.get(row.id)}
                onRemove={removeIds}
              />
            ))}
          </div>
        </div>
      )}

      <RefineSheet
        open={refineOpen}
        onClose={() => setRefineOpen(false)}
        total={sideRows.length}
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
