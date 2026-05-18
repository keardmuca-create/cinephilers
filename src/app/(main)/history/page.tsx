"use client"

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, Check, History, X } from 'lucide-react';
import type { ItemMeta } from '@/app/api/meta/[id]/route';
import type { TvEpisode, TvSeason } from '@/lib/types';

// ─── Domain types ────────────────────────────────────────────────────────────

type ShowStatus  = 'completed' | 'in-progress' | 'stopped';
type SortOption  = 'date' | 'title-asc' | 'title-desc' | 'rating';
type MainTab     = 'all' | 'movies' | 'shows';
type MovieSub    = 'all' | 'movie' | 'tv-movie';
type ShowSub     = 'all' | 'completed' | 'in-progress' | 'stopped';

interface HistoryItem extends ItemMeta {
  rating?:         number;
  loggedAt:        string;
  // show-specific
  status?:         ShowStatus;
  watchedEpCount:  number;
}

// ─── localStorage helpers ────────────────────────────────────────────────────

function readMetaCache(id: string): ItemMeta | null {
  try { return JSON.parse(localStorage.getItem(`meta-${id}`) ?? 'null'); }
  catch { return null; }
}
function writeMetaCache(id: string, m: ItemMeta) {
  localStorage.setItem(`meta-${id}`, JSON.stringify(m));
}

function readWatchedMovieIds(): string[] {
  const ids: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)!;
    if (
      k.startsWith('watched-') &&
      !k.startsWith('watched-ep-') &&
      localStorage.getItem(k) === 'true'
    ) {
      const id = k.slice('watched-'.length);
      // Exclude show IDs — they're handled separately via watched-ep-* keys
      if (!id.startsWith('tmdb-tv-')) ids.push(id);
    }
  }
  return ids;
}

function readWatchedShowIds(): string[] {
  const set = new Set<string>();
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)!;
    if (k.startsWith('watched-ep-')) {
      const m = k.slice('watched-ep-'.length).match(/^(.+)-S\d+E\d+$/);
      if (m) set.add(m[1]);
    }
  }
  return [...set];
}

function readWatchedEpCount(showId: string): number {
  let n = 0;
  const pfx = `watched-ep-${showId}-`;
  for (let i = 0; i < localStorage.length; i++)
    if (localStorage.key(i)!.startsWith(pfx)) n++;
  return n;
}

function readShowStatus(showId: string): ShowStatus {
  const v = localStorage.getItem(`show-status-${showId}`);
  // migrate legacy 'dropped' value
  if (v === 'dropped') { localStorage.setItem(`show-status-${showId}`, 'stopped'); return 'stopped'; }
  return (v ?? 'in-progress') as ShowStatus;
}
function writeShowStatus(showId: string, s: ShowStatus) {
  localStorage.setItem(`show-status-${showId}`, s);
}

function readUserRating(id: string): number | undefined {
  const r = localStorage.getItem(`movie-rating-${id}`);
  return r ? Number(r) : undefined;
}

function readLoggedAt(id: string): string {
  try {
    const log: { id: string; loggedAt: string }[] = JSON.parse(localStorage.getItem('watch-log') ?? '[]');
    const entry = log
      .filter(e => e.id === id || e.id.startsWith(id))
      .sort((a, b) => new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime())[0];
    return entry?.loggedAt ?? new Date(0).toISOString();
  } catch { return new Date(0).toISOString(); }
}

function computeAutoStatus(
  showId: string,
  watchedCount: number,
  totalEps: number | undefined,
  tmdbStatus: string | undefined,
): ShowStatus {
  const stored = readShowStatus(showId);
  if (stored === 'stopped') return 'stopped';
  if (watchedCount === 0) return 'in-progress';
  if (totalEps && watchedCount >= totalEps) {
    // All available episodes watched
    return (tmdbStatus === 'Ended' || tmdbStatus === 'Canceled') ? 'completed' : 'in-progress';
  }
  // Revert 'completed' if new episodes added and not all watched
  if (stored === 'completed') return 'in-progress';
  return stored;
}

async function fetchAndCacheMeta(id: string): Promise<ItemMeta | null> {
  try {
    const r = await fetch(`/api/meta/${id}`);
    if (!r.ok) return null;
    const m: ItemMeta = await r.json();
    writeMetaCache(id, m);
    return m;
  } catch { return null; }
}

function buildItem(id: string, meta: ItemMeta): HistoryItem | null {
  if (meta.type === 'show') {
    const watchedEpCount = readWatchedEpCount(id);
    if (watchedEpCount === 0) return null; // don't show shows with no watched episodes
    const status = computeAutoStatus(id, watchedEpCount, meta.totalEps, meta.tmdbStatus);
    return { ...meta, rating: readUserRating(id), loggedAt: readLoggedAt(id), status, watchedEpCount };
  }
  return { ...meta, rating: readUserRating(id), loggedAt: readLoggedAt(id), watchedEpCount: 0 };
}

// ─── Status constants ─────────────────────────────────────────────────────────

const STATUS_STYLE: Record<ShowStatus, string> = {
  completed:    'bg-green-500/20 text-green-400 border-green-500/30',
  'in-progress':'bg-blue-500/20 text-blue-400 border-blue-500/30',
  stopped:      'bg-red-500/20 text-red-400 border-red-500/30',
};
const STATUS_LABEL: Record<ShowStatus, string> = {
  completed: 'Completed', 'in-progress': 'In Progress', stopped: 'Stopped',
};

// ─── StatusPill ───────────────────────────────────────────────────────────────

function StatusPill({ status, onSelect }: { status: ShowStatus; onSelect: (s: ShowStatus) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  return (
    <div ref={ref} className="relative" onClick={e => e.stopPropagation()}>
      <button
        onClick={() => setOpen(p => !p)}
        className={`text-[10px] font-bold px-2.5 py-1 rounded-full border flex items-center gap-1 whitespace-nowrap ${STATUS_STYLE[status]}`}
      >
        {STATUS_LABEL[status]} <ChevronDown className="h-2.5 w-2.5 flex-shrink-0" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-[#1c1c1e] border border-white/10 rounded-xl overflow-hidden shadow-2xl min-w-[130px]">
          {(['completed', 'in-progress', 'stopped'] as ShowStatus[]).map(s => (
            <button
              key={s}
              onClick={() => { onSelect(s); setOpen(false); }}
              className="w-full text-left px-3 py-2.5 text-xs font-semibold hover:bg-white/10 transition-colors flex items-center gap-2"
            >
              <span className={`w-3 h-3 rounded-full flex-shrink-0 ${status === s ? 'bg-primary' : ''}`} />
              <span className={status === s ? 'text-white' : 'text-muted-foreground'}>{STATUS_LABEL[s]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── EpisodeRow ───────────────────────────────────────────────────────────────

function EpisodeRow({
  ep, showId, sn, isWatched, onToggle,
}: {
  ep: TvEpisode; showId: string; sn: number; isWatched: boolean; onToggle: () => void;
}) {
  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 ${isWatched ? 'opacity-50' : ''}`}>
      <span className="text-[11px] text-muted-foreground w-5 flex-shrink-0 text-right font-mono">{ep.episode_number}</span>
      <Link
        href={`/movie/${showId}`}
        className="flex-1 text-[13px] truncate hover:text-primary transition-colors"
        onClick={e => e.stopPropagation()}
      >
        {ep.name}
      </Link>
      <button
        onClick={e => { e.stopPropagation(); onToggle(); }}
        className={`flex-shrink-0 h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors ${
          isWatched ? 'bg-primary border-primary' : 'border-white/25 hover:border-primary/60'
        }`}
      >
        {isWatched && <Check className="h-2.5 w-2.5 text-white" />}
      </button>
    </div>
  );
}

// ─── SeasonRow ────────────────────────────────────────────────────────────────

function SeasonRow({
  season, showId, watchedEps, onToggleEp, onMarkAll, onUnmarkAll,
}: {
  season: TvSeason;
  showId: string;
  watchedEps: Set<string>;
  onToggleEp: (key: string) => void;
  onMarkAll: (season: TvSeason, eps: TvEpisode[]) => void;
  onUnmarkAll: (season: TvSeason) => void;
}) {
  const [open, setOpen] = useState(false);
  const [eps, setEps] = useState<TvEpisode[] | null>(null);
  const [loading, setLoading] = useState(false);
  const tmdbId = showId.replace('tmdb-tv-', '');
  const sn = season.season_number;

  const watchedCount = [...watchedEps].filter(k => k.startsWith(`S${sn}E`)).length;
  const total = season.episode_count;
  const allDone = total > 0 && watchedCount === total;
  const pct = total > 0 ? (watchedCount / total) * 100 : 0;

  async function getEps(): Promise<TvEpisode[]> {
    if (eps !== null) return eps;
    setLoading(true);
    try {
      const r = await fetch(`/api/tv/${tmdbId}/season/${sn}`);
      const d = await r.json();
      const fetched: TvEpisode[] = d.episodes ?? [];
      setEps(fetched);
      return fetched;
    } catch { setEps([]); return []; }
    finally { setLoading(false); }
  }

  const toggle = async () => {
    if (!open && eps === null) await getEps();
    setOpen(p => !p);
  };

  const handleMarkAll = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const list = await getEps();
    if (allDone) onUnmarkAll(season);
    else onMarkAll(season, list);
  };

  const statusLabel = allDone ? 'Complete' : watchedCount === 0 ? 'Not Started' : `${watchedCount}/${total}`;

  return (
    <div className="border-t border-white/[0.05] first:border-0">
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/[0.02] transition-colors"
        onClick={toggle}
      >
        <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground flex-shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
        <span className="text-sm font-semibold flex-shrink-0 w-24 truncate">{season.name}</span>

        <div className="flex-1 flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${allDone ? 'bg-green-500' : 'bg-primary'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className={`text-[11px] font-medium flex-shrink-0 w-20 text-right ${allDone ? 'text-green-400' : 'text-muted-foreground'}`}>
            {statusLabel}
          </span>
        </div>

        <button
          onClick={handleMarkAll}
          className="flex-shrink-0 text-[11px] px-2.5 py-1 rounded-full border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-muted-foreground hover:text-white transition-colors"
        >
          {allDone ? 'Unmark All' : 'Mark All'}
        </button>
      </div>

      {open && (
        <div className="bg-white/[0.015]">
          {loading && <p className="py-4 text-center text-xs text-muted-foreground">Loading…</p>}
          {eps?.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">No episode data</p>}
          {eps?.map(ep => (
            <EpisodeRow
              key={ep.id}
              ep={ep}
              showId={showId}
              sn={sn}
              isWatched={watchedEps.has(`S${sn}E${ep.episode_number}`)}
              onToggle={() => onToggleEp(`S${sn}E${ep.episode_number}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── ShowCard ─────────────────────────────────────────────────────────────────

function ShowCard({
  item,
  onStatusChange,
}: {
  item: HistoryItem;
  onStatusChange: (id: string, status: ShowStatus) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState<ShowStatus>(item.status ?? 'in-progress');
  const [seasons, setSeasons] = useState<TvSeason[] | null>(null);
  const [loadingShow, setLoadingShow] = useState(false);
  const [watchedEps, setWatchedEps] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    const s = new Set<string>();
    const pfx = `watched-ep-${item.id}-`;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (k.startsWith(pfx)) s.add(k.slice(pfx.length));
    }
    return s;
  });
  const [statusPromptVisible, setStatusPromptVisible] = useState(false);
  const promptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (promptTimerRef.current) clearTimeout(promptTimerRef.current); }, []);

  const showPrompt = useCallback(() => {
    setStatusPromptVisible(true);
    if (promptTimerRef.current) clearTimeout(promptTimerRef.current);
    promptTimerRef.current = setTimeout(() => setStatusPromptVisible(false), 7000);
  }, []);

  const handleExpand = async () => {
    if (!expanded && seasons === null) {
      setLoadingShow(true);
      try {
        const r = await fetch(`/api/movies/${item.id}`);
        const d = await r.json();
        setSeasons(
          ((d.seasons ?? []) as TvSeason[])
            .filter(s => s.season_number > 0)
            .sort((a, b) => a.season_number - b.season_number),
        );
      } catch { setSeasons([]); }
      finally { setLoadingShow(false); }
    }
    setExpanded(p => !p);
  };

  const afterEpChange = useCallback((next: Set<string>): ShowStatus => {
    const newStatus = computeAutoStatus(item.id, next.size, item.totalEps, item.tmdbStatus);
    if (newStatus !== status) {
      setStatus(newStatus);
      writeShowStatus(item.id, newStatus);
      onStatusChange(item.id, newStatus);
    }
    return newStatus;
  }, [item.id, item.totalEps, item.tmdbStatus, status, onStatusChange]);

  const toggleEp = useCallback((key: string) => {
    const lk = `watched-ep-${item.id}-${key}`;
    const isAdding = !watchedEps.has(key);
    const next = new Set(watchedEps);
    if (isAdding) { next.add(key); localStorage.setItem(lk, 'true'); }
    else          { next.delete(key); localStorage.removeItem(lk); }
    setWatchedEps(next);
    const newStatus = afterEpChange(next);
    if (isAdding && newStatus !== 'completed') showPrompt();
  }, [item.id, watchedEps, afterEpChange, showPrompt]);

  const markAll = useCallback((season: TvSeason, eps: TvEpisode[]) => {
    const sn = season.season_number;
    const next = new Set(watchedEps);
    for (const ep of eps) {
      const key = `S${sn}E${ep.episode_number}`;
      if (!next.has(key)) { next.add(key); localStorage.setItem(`watched-ep-${item.id}-${key}`, 'true'); }
    }
    setWatchedEps(next);
    const newStatus = afterEpChange(next);
    if (newStatus !== 'completed') showPrompt();
  }, [item.id, watchedEps, afterEpChange, showPrompt]);

  const unmarkAll = useCallback((season: TvSeason) => {
    const sn = season.season_number;
    const next = new Set(watchedEps);
    for (const key of [...next]) {
      if (key.startsWith(`S${sn}E`)) { next.delete(key); localStorage.removeItem(`watched-ep-${item.id}-${key}`); }
    }
    setWatchedEps(next);
    afterEpChange(next);
  }, [item.id, watchedEps, afterEpChange]);

  const handleStatusSelect = (s: ShowStatus) => {
    setStatus(s);
    writeShowStatus(item.id, s);
    onStatusChange(item.id, s);
    setStatusPromptVisible(false);
    if (promptTimerRef.current) clearTimeout(promptTimerRef.current);
  };

  const isMini = item.showType?.toLowerCase().includes('mini');
  const typeLabel = isMini ? 'TV Mini Series' : 'TV Series';
  const totalText = item.totalEps
    ? `${watchedEps.size}/${item.totalEps} episodes`
    : `${watchedEps.size} ep${watchedEps.size !== 1 ? 's' : ''} watched`;

  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden">
      {/* Header row */}
      <div
        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-white/[0.02] transition-colors"
        onClick={handleExpand}
      >
        <div className="flex-shrink-0 w-12 h-[72px] rounded-xl overflow-hidden bg-white/5">
          <img src={item.poster} alt={item.title} className="w-full h-full object-cover" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate leading-tight">{item.title}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-muted-foreground">{item.year}</span>
            <span className="text-[10px] text-muted-foreground/50 border border-white/[0.08] px-1.5 py-px rounded">{typeLabel}</span>
          </div>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <StatusPill status={status} onSelect={handleStatusSelect} />
            <span className="text-[11px] text-muted-foreground">{totalText}</span>
            {item.rating !== undefined && (
              <div className="flex items-center gap-0.5">
                <span className="text-[11px] text-yellow-400 font-bold">★</span>
                <span className="text-[11px] font-semibold">{item.rating}/10</span>
              </div>
            )}
          </div>
          {/* Status prompt after partial episode/season mark */}
          {statusPromptVisible && (
            <div
              className="flex items-center gap-1.5 mt-1.5"
              onClick={e => e.stopPropagation()}
            >
              <span className="text-[10px] text-muted-foreground/60">Set status:</span>
              {(['in-progress', 'stopped'] as ShowStatus[]).map(s => (
                <button
                  key={s}
                  onClick={() => handleStatusSelect(s)}
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-colors ${
                    status === s ? STATUS_STYLE[s] : 'border-white/10 text-muted-foreground hover:text-white'
                  }`}
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
              <button
                onClick={() => { setStatusPromptVisible(false); if (promptTimerRef.current) clearTimeout(promptTimerRef.current); }}
                className="text-muted-foreground/30 hover:text-muted-foreground transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>

        <ChevronDown className={`h-4 w-4 text-muted-foreground flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </div>

      {/* Expanded seasons */}
      {expanded && (
        <div className="border-t border-white/[0.06]">
          {loadingShow && <p className="py-6 text-center text-xs text-muted-foreground">Loading seasons…</p>}
          {seasons?.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">No season data available</p>}
          {seasons?.map(s => (
            <SeasonRow
              key={s.id}
              season={s}
              showId={item.id}
              watchedEps={watchedEps}
              onToggleEp={toggleEp}
              onMarkAll={markAll}
              onUnmarkAll={unmarkAll}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── MovieCard ────────────────────────────────────────────────────────────────

function MovieCard({ item }: { item: HistoryItem }) {
  const isTvMovie = item.genre?.includes('TV Movie');
  return (
    <Link
      href={`/movie/${item.id}`}
      className="flex items-center gap-3 p-3 bg-white/[0.03] border border-white/[0.06] rounded-2xl hover:bg-white/[0.05] transition-colors"
    >
      <div className="flex-shrink-0 w-12 h-[72px] rounded-xl overflow-hidden bg-white/5">
        <img src={item.poster} alt={item.title} className="w-full h-full object-cover" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm truncate">{item.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-muted-foreground">{item.year}</span>
          {isTvMovie && (
            <span className="text-[10px] text-muted-foreground/50 border border-white/[0.08] px-1.5 py-px rounded">TV Movie</span>
          )}
        </div>
        {item.rating !== undefined ? (
          <div className="flex items-center gap-1 mt-1">
            <span className="text-xs text-yellow-400 font-bold">★</span>
            <span className="text-xs font-semibold">{item.rating}/10</span>
          </div>
        ) : (
          <span className="text-[11px] text-muted-foreground/30 mt-1 block">Rate it</span>
        )}
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HistoryPage() {
  const [items, setItems]         = useState<HistoryItem[]>([]);
  const [fetching, setFetching]   = useState(true);
  const [sort, setSort]           = useState<SortOption>('date');
  const [tab, setTab]             = useState<MainTab>('all');
  const [movieSub, setMovieSub]   = useState<MovieSub>('all');
  const [showSub, setShowSub]     = useState<ShowSub>('all');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const movieIds = readWatchedMovieIds();
      const showIds  = readWatchedShowIds();
      const allIds   = [...movieIds, ...showIds];

      // Immediately show cached items
      const initial: HistoryItem[] = [];
      const uncached: string[]     = [];
      for (const id of allIds) {
        const m = readMetaCache(id);
        if (m) { const item = buildItem(id, m); if (item) initial.push(item); }
        else uncached.push(id);
      }
      if (!cancelled) setItems(initial);
      if (!cancelled) setFetching(uncached.length > 0);

      // Fetch uncached in batches of 5
      for (let i = 0; i < uncached.length; i += 5) {
        if (cancelled) break;
        const batch = uncached.slice(i, i + 5);
        const metas = await Promise.all(batch.map(fetchAndCacheMeta));
        const newItems = metas
          .map((m, j) => m ? buildItem(batch[j], m) : null)
          .filter((x): x is HistoryItem => x !== null);
        if (!cancelled && newItems.length) setItems(prev => [...prev, ...newItems]);
      }
      if (!cancelled) setFetching(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const handleStatusChange = useCallback((id: string, status: ShowStatus) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, status } : item));
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const { id, rating } = (e as CustomEvent<{ id: string; rating: number | null }>).detail;
      setItems(prev => prev.map(item => item.id === id ? { ...item, rating: rating ?? undefined } : item));
    };
    window.addEventListener('cinephilers-rating-changed', handler);
    return () => window.removeEventListener('cinephilers-rating-changed', handler);
  }, []);

  // Sort
  const sorted = [...items].sort((a, b) => {
    if (sort === 'date')       return new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime();
    if (sort === 'title-asc')  return a.title.localeCompare(b.title);
    if (sort === 'title-desc') return b.title.localeCompare(a.title);
    if (sort === 'rating')     return (b.rating ?? -1) - (a.rating ?? -1);
    return 0;
  });

  // Filter
  const filtered = sorted.filter(item => {
    if (tab === 'movies') {
      if (item.type !== 'movie') return false;
      if (movieSub === 'movie')    return !item.genre?.includes('TV Movie');
      if (movieSub === 'tv-movie') return !!item.genre?.includes('TV Movie');
      return true;
    }
    if (tab === 'shows') {
      if (item.type !== 'show') return false;
      if (showSub !== 'all') return item.status === showSub;
      return true;
    }
    return true; // 'all'
  });

  const tabMovieCount = items.filter(i => i.type === 'movie').length;
  const tabShowCount  = items.filter(i => i.type === 'show').length;

  const TABS: [MainTab, string][] = [
    ['all',    `All ${items.length}`],
    ['movies', `Movies ${tabMovieCount}`],
    ['shows',  `Shows ${tabShowCount}`],
  ];

  return (
    <main className="p-6 pt-12 pb-32 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-headline font-bold">Watch History</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {items.length} Title{items.length !== 1 ? 's' : ''}
            {fetching && <span className="ml-2 opacity-60">loading…</span>}
          </p>
        </div>
        <select
          value={sort}
          onChange={e => setSort(e.target.value as SortOption)}
          className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 flex-shrink-0"
        >
          <option value="date">Date Added</option>
          <option value="title-asc">Title A–Z</option>
          <option value="title-desc">Title Z–A</option>
          <option value="rating">Rating</option>
        </select>
      </div>

      {/* Main tabs */}
      <div className="flex gap-1 bg-white/5 p-1 rounded-2xl">
        {TABS.map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${
              tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Subfilters */}
      {tab === 'movies' && (
        <div className="flex gap-2 flex-wrap">
          {([['all', 'All'], ['movie', 'Movie'], ['tv-movie', 'TV Movie']] as [MovieSub, string][]).map(([v, l]) => (
            <button
              key={v}
              onClick={() => setMovieSub(v)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                movieSub === v ? 'bg-primary/20 border-primary/40 text-primary' : 'border-white/10 text-muted-foreground hover:text-white'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      )}
      {tab === 'shows' && (
        <div className="flex gap-2 flex-wrap">
          {([['all', 'All'], ['completed', 'Completed'], ['in-progress', 'In Progress'], ['stopped', 'Stopped']] as [ShowSub, string][]).map(([v, l]) => (
            <button
              key={v}
              onClick={() => setShowSub(v)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                showSub === v ? 'bg-primary/20 border-primary/40 text-primary' : 'border-white/10 text-muted-foreground hover:text-white'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      )}

      {/* List */}
      {fetching && items.length === 0 ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-[90px] bg-white/5 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <History className="h-12 w-12 text-muted-foreground/20" />
          <p className="text-muted-foreground text-sm">Nothing here yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(item =>
            item.type === 'show'
              ? <ShowCard key={item.id} item={item} onStatusChange={handleStatusChange} />
              : <MovieCard key={item.id} item={item} />
          )}
        </div>
      )}
    </main>
  );
}
