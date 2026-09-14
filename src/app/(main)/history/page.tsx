"use client"

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { History, Search, SlidersHorizontal, X, Trash2, Film, ChevronLeft } from 'lucide-react';
import type { ItemMeta } from '@/app/api/meta/[id]/route';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { persistRefine } from '@/lib/refine-sort';
import { removeFromWatchLog } from '@/lib/watch-log';
import { allWatchedEpisodeIds } from '@/lib/episode-store';
import { allWatchedTitleIds, setWatchedTitle, readUserRating as readStoredRating } from '@/lib/library-store';
import { legacyTwin, normalizeLocalMediaIds, getWatchedAtISO, getManualWatchISO } from '@/lib/media-id';
import { batchFetchMeta, isStaleMeta, type CachedMeta } from '@/lib/meta-batch';
import { readCachedMeta, EPISODE_LIMIT } from '@/lib/meta-cache';
import { useLoadOnScroll } from '@/hooks/use-load-on-scroll';
import { getItemType, sideOf, SIDE_TYPES, TYPE_LABELS, type TypeFilter, type MediaSide } from '@/lib/media-type';
import { collapseShows, type CollapsedRow } from '@/lib/collapse-shows';
import { MediaToggle } from '@/components/media-toggle';
import { RefineSheet, type RefineValue, type SortOption, type CountOption } from '@/components/refine-sheet';
import { WatchedEye } from '@/components/watched-eye';
import { useCommunityRatings } from '@/hooks/use-community-ratings';
import { useConfirm } from '@/components/confirm-dialog';
import { toast } from '@/hooks/use-toast';

// ─── Refine config ──────────────────────────────────────────────────────────

const SORT_OPTIONS: SortOption[] = [
  { value: 'date',    label: 'Date watched' },
  { value: 'release', label: 'Release date' },
  { value: 'title',   label: 'Title' },
];

const DEFAULT_REFINE: RefineValue = { sortField: 'date', sortDir: 'desc', type: 'any', genre: 'any' };

// Episode rows a long Episodes side adds each time you near the bottom.
const EPISODE_PAGE = 50;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readAllWatchedIds(): string[] {
  const ids = new Set<string>();
  try {
    // Films (and any bare whole-show mark) from the watched store.
    for (const id of allWatchedTitleIds()) ids.add(id);
    // Episodes from each show's list, as full ids (tmdb-tv-299167-S1E2).
    for (const epId of allWatchedEpisodeIds()) ids.add(epId);
  } catch { /* ignore */ }
  return [...ids];
}

// The newest log date per id, a show also taking its newest episode's. Built once
// per load: filtering the whole log again for every watched title was 17,347 passes
// over thousands of entries for a large library.
function newestLoggedAt(log: { id: string; loggedAt: string }[]): Map<string, string> {
  const newest = new Map<string, string>();
  const keep = (id: string, iso: string) => {
    const prev = newest.get(id);
    if (!prev || new Date(iso).getTime() > new Date(prev).getTime()) newest.set(id, iso);
  };
  for (const e of log) {
    if (!e?.id || !e.loggedAt) continue;
    keep(e.id, e.loggedAt);
    const ep = /^(.+)-S\d+E\d+$/.exec(e.id);
    if (ep) keep(ep[1], e.loggedAt);
  }
  return newest;
}

function readLoggedAt(id: string, newest: Map<string, string>): string {
  // Titles not logged in the app (synced, imported, shows) aren't in the watch log;
  // the watched-at index dates them so they sort by date instead of sinking to 1970.
  return newest.get(id) ?? getWatchedAtISO(id) ?? new Date(0).toISOString();
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

// CachedMeta, not ItemMeta: entries carry the stamp that says how old they are.
// Nothing here writes the cache back — batchFetchMeta already has, and writing a
// whole library a second time would only make the cache trim it again.
function readMetaCache(id: string): CachedMeta | null {
  return readCachedMeta(id);
}

function readUserRating(id: string): number | undefined {
  return readStoredRating(id);
}

function formatAddedDate(iso: string): string {
  if (!iso || iso === new Date(0).toISOString()) return '';
  try {
    const d = new Date(iso);
    return `Added on ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  } catch { return ''; }
}

// Forget one episode locally: the phantom watched-<id> an old sync bug left
// behind, its entry in the per-show index, and its watch-log line.
function forgetEpisodeLocally(epId: string, showId: string, season: number, episode: number) {
  try {
    setWatchedTitle(epId, false);
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
  const confirm = useConfirm();
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
  const episodeLabel = meta.isEpisode && meta.seasonNumber !== undefined && meta.episodeNumber !== undefined
    ? `S${meta.seasonNumber}·E${meta.episodeNumber}${meta.showName ? ` · ${meta.showName}` : ''}`
    : null;

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
    setWatchedTitle(id, false);
    removeFromWatchLog(id, 'movie');
    await fetchWithAuth(`/api/watched/${id}?mediaType=SHOW`, { method: 'DELETE' }).then(ensureOk);
  };

  const handleRemove = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (row.isShow && row.watchedEpisodes > 0) {
      const count = row.watchedEpisodes;
      const yes = await confirm({
        title: `Remove ${displayTitle} from your history?`,
        description: `This unmarks ${count} watched episode${count === 1 ? '' : 's'}.`,
        confirmLabel: 'Remove',
      });
      if (!yes) return;
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
        setWatchedTitle(id, false);
        removeFromWatchLog(id, 'movie');
        await fetchWithAuth(`/api/watched/${id}?mediaType=${mediaType}`, { method: 'DELETE' }).then(ensureOk);
        // Also clear any legacy bare-numeric twin (older imports stored "262504" instead
        // of "tmdb-262504"); without this, the leftover row syncs back as a duplicate.
        // Confirm it too — deleteMany is a no-op when there's no twin, so this only
        // throws on a genuine failure that would otherwise resurrect the duplicate.
        const twin = legacyTwin(id);
        if (twin) {
          setWatchedTitle(twin, false);
          removeFromWatchLog(twin, 'movie');
          await fetchWithAuth(`/api/watched/${twin}?mediaType=${mediaType}`, { method: 'DELETE' }).then(ensureOk);
        }
      }
    } catch {
      toast({ title: "Couldn't delete this. Check your connection and try again.", variant: 'destructive' });
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
        {/* On the Episodes side the title alone is an orphan: "What Lies Ahead"
            names nothing you can place. The show and the number go underneath as
            context rather than in front of the title, which is still the thing
            you are looking for. Same line the Ratings list uses. */}
        {episodeLabel && (
          <p className="text-xs font-medium text-muted-foreground/90 mb-0.5">{episodeLabel}</p>
        )}
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
      if (saved === 'movies' || saved === 'shows' || saved === 'episodes') setSide(saved);
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
    const newest = newestLoggedAt(log);
    for (const id of ids) dm.set(id, readLoggedAt(id, newest));
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

  // ─── Fetch metadata for films and shows ───────────────────────────────────
  // Not for episodes. The collapse groups them from their ids and the show's own
  // entry (fetched below, once per show) carries the total, so fetching each one
  // was 13,000 lookups for a big library and most of what filled its storage. The
  // Episodes side fetches the episodes it shows, further down.

  useEffect(() => {
    if (allIds.length === 0) return;
    const toFetch = allIds.filter(id => !EP_ID.test(id) && !fetchingRef.current.has(id));
    if (toFetch.length === 0) return;
    toFetch.forEach(id => fetchingRef.current.add(id));
    setFetching(true);

    const runBatches = async () => {
      const fetched = await batchFetchMeta(toFetch);
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
      // An episode's own entry is usually not loaded — only the Episodes side
      // fetches those — so its show's entry answers for it. That is the right
      // answer anyway: the show's total is the one kept up to date.
      const ep = EP_ID.exec(id);
      const show = ep ? metaMap.get(ep[1]) : undefined;
      return {
        id,
        showId: m?.showId,
        isEpisode: m?.isEpisode,
        totalEpisodes: show?.totalEps ?? m?.totalEps,
        showStatus: show?.tmdbStatus ?? m?.tmdbStatus,
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

  // Episodes are the unit of work on the Shows side — seven shows says far less
  // about what you've watched than the episodes under them do.
  const episodeTotal = useMemo(
    () => rows.reduce((n, r) => n + (r.isShow ? r.watchedEpisodes : 0), 0),
    [rows],
  );

  // The Episodes side is the collapse turned off: every episode is its own row,
  // with the night it was watched, which is the one thing a collapsed show row
  // can never tell you. The collapse itself is untouched and still governs the
  // Shows side — this is a different question asked of the same data, not a
  // reversal. Built from allIds rather than from rows for that reason.
  const episodeRows = useMemo<CollapsedRow[]>(() => {
    if (side !== 'episodes') return [];
    // By id, not by entry: an episode's entry is only fetched once it is shown.
    return allIds
      .filter(id => EP_ID.test(id))
      .map(id => ({
        id,
        isShow: false,
        watchedEpisodes: 0,
        totalEpisodes: 0,
        status: null,
        watchedAt: dateMapRef.current.get(id) ?? new Date(0).toISOString(),
        memberIds: [id],
      } as CollapsedRow));
  }, [side, allIds]);

  const sideRows = useMemo(
    () => (side === 'episodes' ? episodeRows : rows.filter(r => sideForRow(r) === side)),
    [side, episodeRows, rows, sideForRow],
  );

  // A long Episodes side is shown a screen at a time, and only the episodes on
  // screen are fetched. Up to EPISODE_LIMIT — all the cache keeps — every entry is
  // fetched up front as before, so the name and release-date sorts work as they
  // always did. Past it those two sorts go by show and episode number instead:
  // they can't wait on thousands of entries that are no longer kept.
  const manyEpisodes = side === 'episodes' && sideRows.length > EPISODE_LIMIT;
  const [episodeWindow, setEpisodeWindow] = useState(EPISODE_PAGE);

  const sideCounts = useMemo(() => {
    let movies = 0, shows = 0;
    for (const r of rows) (sideForRow(r) === 'shows' ? shows++ : movies++);
    return { movies, shows, episodes: episodeTotal };
  }, [rows, sideForRow, episodeTotal]);


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
    // Nothing to offer on the Episodes side: every row there is a TV Episode, so
    // a Type list would be one option filtering nothing. Hidden rather than shown
    // inert — a control that cannot change the list reads as broken.
    const present = side === 'episodes' ? [] : SIDE_TYPES[side].filter(t => (counts.get(t) ?? 0) > 0);
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
    // The show an episode belongs to, and its place in it.
    const showOf = (r: CollapsedRow) => {
      const ep = EP_ID.exec(r.id);
      const show = ep ? metaMap.get(ep[1]) : undefined;
      return { title: show?.title ?? '', release: show?.releaseDate ?? '', order: ep ? Number(ep[2]) * 10000 + Number(ep[3]) : 0 };
    };

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      // An episode also matches by its show's name.
      list = list.filter(r => {
        const title = metaMap.get(r.id)?.title ?? '';
        const show = side === 'episodes' ? showOf(r).title : '';
        return `${title} ${show}`.toLowerCase().includes(q);
      });
    }

    if (refine.sortField === 'title') {
      if (manyEpisodes) {
        list.sort((a, b) => {
          const sa = showOf(a), sb = showOf(b);
          return sa.title.localeCompare(sb.title) || sa.order - sb.order;
        });
      } else {
        list.sort((a, b) => (metaMap.get(a.id)?.title ?? '').localeCompare(metaMap.get(b.id)?.title ?? ''));
      }
      if (refine.sortDir === 'desc') list.reverse();
    } else if (refine.sortField === 'release') {
      // Full release-date timestamp; falls back to Jan 1 of the year, null when unknown.
      const ts = (r: CollapsedRow): number | null => {
        const m = metaMap.get(r.id);
        const raw = manyEpisodes
          ? showOf(r).release
          : m?.releaseDate || (m && /^\d{4}$/.test(m.year) ? `${m.year}-01-01` : '');
        const t = raw ? Date.parse(raw) : NaN;
        return Number.isNaN(t) ? null : t;
      };
      const dir = refine.sortDir === 'desc' ? -1 : 1;
      list.sort((a, b) => {
        const ta = ts(a), tb = ts(b);
        if (ta === null && tb === null) return 0;
        if (ta === null) return 1;   // unknown date sinks to the bottom
        if (tb === null) return -1;
        return (ta - tb) * dir || (manyEpisodes ? (showOf(a).order - showOf(b).order) * dir : 0);
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
  }, [sideRows, refine, search, metaMap, manualMap, side, manyEpisodes]);

  // Back to the first screen whenever the list itself changes.
  useEffect(() => { setEpisodeWindow(EPISODE_PAGE); }, [side, refine, search]);

  const visibleRows = useMemo(
    () => (manyEpisodes ? sortedFilteredRows.slice(0, episodeWindow) : sortedFilteredRows),
    [manyEpisodes, sortedFilteredRows, episodeWindow],
  );
  const loadMoreRef = useLoadOnScroll(
    () => setEpisodeWindow(n => n + EPISODE_PAGE),
    manyEpisodes && episodeWindow < sortedFilteredRows.length,
    visibleRows.length,
  );

  // The episodes being shown — every one, for a short list — that have no entry
  // yet. Cached ones were marked as held when the page read storage.
  useEffect(() => {
    if (side !== 'episodes') return;
    const missing = visibleRows.map(r => r.id).filter(id => !fetchingRef.current.has(id));
    if (missing.length === 0) return;
    missing.forEach(id => fetchingRef.current.add(id));
    (async () => {
      const fetched = await batchFetchMeta(missing);
      setMetaMap(prev => {
        const next = new Map(prev);
        for (const [id, m] of Object.entries(fetched)) next.set(id, m);
        return next;
      });
    })();
  }, [side, visibleRows]);

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

      {/* Movies | Shows | Episodes */}
      <div className="px-6 pb-3">
        <MediaToggle value={side} onChange={changeSide} counts={sideCounts} sides={['movies', 'shows', 'episodes']} />
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
          {sortedFilteredRows.length} {side === 'shows' ? 'show' : side === 'episodes' ? 'episode' : 'title'}{sortedFilteredRows.length !== 1 ? 's' : ''}
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
            {visibleRows.map(row => (
              <HistoryCard
                key={row.id}
                row={row}
                meta={metaMap.get(row.id)}
                userRating={userRatings.get(row.id)}
                onRemove={removeIds}
              />
            ))}
          </div>
          {manyEpisodes && episodeWindow < sortedFilteredRows.length && <div ref={loadMoreRef} className="h-px" />}
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
