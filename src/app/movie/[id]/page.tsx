"use client"

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Movie, Actor, TvEpisode, TvSeason, MovieCollection, CollectionItem } from '@/lib/types';
import { SpoilerWrap } from '@/components/spoiler-wrap';
import { Button } from '@/components/ui/button';
import {
  Play, Check, Plus, Star, ChevronLeft, Share2, ListPlus, Quote,
  Info, Film, Calendar, Clock, Globe, Building2, Tv, ChevronDown, ChevronUp,
  DollarSign, Images, Clapperboard, PenLine, Eye, ChevronRight, User, Users, MessageSquare, Trash2,
  Repeat,
} from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { appendWatchLog, removeFromWatchLog, saveMovieRating, ensureSignupDate } from '@/lib/badges';
import { recordAddedAt, recordWatchedAt, recordManualWatch, removeManualWatch, legacyTwin, parseEpisodeId } from '@/lib/media-id';
import { EpisodePage } from '@/components/episode-page';
import { RatingSheet } from '@/components/rating-sheet';
import { logActivity, removeActivity, relativeTime } from '@/lib/activity';
import { useAuth } from '@/contexts/auth-context';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { AuthGateModal } from '@/components/auth-gate-modal';
import { CinephilersRating } from '@/lib/cinephilers-rating';

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function DetailSkeleton() {
  return (
    <main className="min-h-screen pb-32 bg-background">
      <div className="relative w-full h-[50vh] bg-muted animate-pulse" />
      <div className="px-6 space-y-12 mt-8">
        <div className="flex gap-8">
          <Skeleton className="w-48 aspect-[2/3] rounded-[2rem] shrink-0" />
          <div className="flex-1 space-y-4 pt-4">
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-20 w-full" />
          </div>
        </div>
      </div>
    </main>
  );
}

// ─── Person card ──────────────────────────────────────────────────────────────

function PersonCard({ actor }: { actor: Actor }) {
  return (
    <Link href={`/person/${actor.id}`} className="shrink-0 w-36 group cursor-pointer block">
      <div className="relative aspect-[2/3] rounded-2xl overflow-hidden mb-2 group-hover:ring-2 ring-primary ring-offset-2 ring-offset-background transition-all bg-muted flex items-center justify-center">
        {actor.profileImage ? (
          <Image src={actor.profileImage} alt={actor.name} fill className="object-cover" sizes="144px" />
        ) : (
          <User className="h-12 w-12 text-muted-foreground/40" />
        )}
      </div>
      <h4 className="text-xs font-bold font-headline line-clamp-1">{actor.name}</h4>
      <p className="text-[10px] text-muted-foreground line-clamp-1">{actor.role}</p>
    </Link>
  );
}

// ─── Collection section ───────────────────────────────────────────────────────
// Other films in the same franchise (Dune 1/2/3, the Dark Knight trilogy, …),
// shown in release order so viewers can discover earlier/later entries.

function CollectionCard({ part }: { part: CollectionItem }) {
  const isWatched = typeof window !== 'undefined' && localStorage.getItem(`watched-${part.id}`) === 'true';
  const ratingRaw = typeof window !== 'undefined' ? localStorage.getItem(`movie-rating-${part.id}`) : null;
  const userRating = ratingRaw ? Number(ratingRaw) : undefined;
  const isUpcoming = part.releaseDate ? new Date(part.releaseDate).getTime() > Date.now() : false;
  const comingLabel = isUpcoming && part.releaseDate
    ? new Date(part.releaseDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : '';

  const inner = (
    <>
      <div className={`relative w-full h-[165px] overflow-hidden rounded-xl bg-muted shadow-md ${part.isCurrent ? 'ring-2 ring-primary' : 'border border-border'}`}>
        {part.poster ? (
          <img src={part.poster} alt={part.title} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center"><Film className="h-7 w-7 text-primary/60" /></div>
        )}
        {part.isCurrent ? (
          <span className="absolute bottom-1 inset-x-1 bg-primary text-white text-[10px] font-bold text-center rounded py-0.5">You're here</span>
        ) : isUpcoming ? (
          <span className="absolute top-1 left-1 bg-amber-500/90 text-white text-[10px] font-bold rounded px-1.5 py-0.5">Soon</span>
        ) : null}
      </div>
      <div className="flex justify-between gap-1.5 mt-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold font-headline line-clamp-2 leading-snug">{part.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{isUpcoming ? `Coming ${comingLabel}` : part.year}</p>
        </div>
        {!isUpcoming && (part.tmdbRating !== undefined || isWatched || userRating !== undefined) && (
          <div className="flex flex-col items-end gap-0.5 shrink-0">
            {part.tmdbRating !== undefined && (
              <div className="flex items-center gap-0.5">
                <span className="text-xs text-yellow-400 font-bold">★</span>
                <span className="text-xs font-bold text-foreground">{part.tmdbRating.toFixed(1)}</span>
              </div>
            )}
            {isWatched && <Eye className="h-3.5 w-3.5 text-blue-400" />}
            {userRating !== undefined && (
              <div className="flex items-center gap-0.5">
                <span className="text-xs text-blue-400 font-bold">★</span>
                <span className="text-xs font-bold text-blue-400">{userRating}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );

  if (part.isCurrent) {
    return <div className="group w-[110px] shrink-0">{inner}</div>;
  }
  return (
    <Link href={`/movie/${part.id}`} className="group w-[110px] shrink-0">{inner}</Link>
  );
}

const COLLECTION_PREVIEW = 6;

function CollectionSection({ collection, movieId }: { collection: MovieCollection; movieId: string }) {
  const showSeeAll = collection.parts.length > COLLECTION_PREVIEW;
  const parts = showSeeAll ? collection.parts.slice(0, COLLECTION_PREVIEW) : collection.parts;
  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-2xl font-headline font-bold flex items-center gap-2 min-w-0">
          <span className="truncate">{collection.name}</span>
          <span className="text-2xl font-bold text-muted-foreground shrink-0">{collection.parts.length}</span>
        </h3>
        {showSeeAll && (
          <Link
            href={`/movie/${movieId}/collection`}
            className="text-xs text-primary border border-primary/30 rounded-full px-3 py-1 hover:bg-primary/10 transition-colors font-semibold flex items-center gap-1 shrink-0"
          >
            See All <ChevronRight className="h-3 w-3" />
          </Link>
        )}
      </div>
      <ScrollArea className="w-full">
        <div className="flex items-start gap-4 pb-4">
          {parts.map(part => <CollectionCard key={part.id} part={part} />)}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </section>
  );
}

// ─── Trailer section ──────────────────────────────────────────────────────────

function TrailersSection({ trailers }: { trailers: NonNullable<Movie['trailers']> }) {
  const [active, setActive] = useState(0);
  if (trailers.length === 0) return null;

  return (
    <section className="space-y-6">
      <h3 className="text-2xl font-headline font-bold flex items-center gap-3">
        <Clapperboard className="h-6 w-6 text-primary" /> Trailers & Clips
      </h3>
      <div className="rounded-3xl overflow-hidden border border-border shadow-2xl aspect-video w-full">
        <iframe
          key={trailers[active].key}
          src={`https://www.youtube.com/embed/${trailers[active].key}?rel=0`}
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title={trailers[active].name}
        />
      </div>
    </section>
  );
}

// ─── Images gallery ───────────────────────────────────────────────────────────

function ImagesGallery({ images, movieId }: { images: string[]; movieId: string }) {
  if (images.length === 0) return null;
  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-2xl font-headline font-bold flex items-center gap-3">
          <Images className="h-6 w-6 text-primary" /> Photos
        </h3>
        <Link
          href={`/movie/${movieId}/photos`}
          className="text-xs text-primary border border-primary/30 rounded-full px-3 py-1 hover:bg-primary/10 transition-colors font-semibold"
        >
          See All {images.length}
        </Link>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {images.slice(0, 6).map((url, i) => (
          <div key={i} className="relative aspect-video rounded-2xl overflow-hidden border border-border">
            <Image src={url} alt="" fill className="object-cover" />
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Release info ─────────────────────────────────────────────────────────────

function InfoRow({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
        <p className="text-sm font-bold">{value}</p>
      </div>
    </div>
  );
}

function ReleaseInfo({ movie }: { movie: Movie }) {
  const fmt = (n: number) =>
    n >= 1_000_000
      ? `$${(n / 1_000_000).toFixed(1)}M`
      : `$${n.toLocaleString()}`;

  const rows: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }[] = [];

  if (movie.releaseDate) rows.push({ icon: Calendar, label: 'Release Date', value: new Date(movie.releaseDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) });
  if (movie.runtime) rows.push({ icon: Clock, label: 'Runtime', value: `${Math.floor(movie.runtime / 60)}h ${movie.runtime % 60}m` });
  if (movie.episodeRuntime) rows.push({ icon: Clock, label: 'Episode Length', value: `${movie.episodeRuntime} min` });
  if (movie.status) rows.push({ icon: Info, label: 'Status', value: movie.status });
  if (movie.originalLanguage) rows.push({ icon: Globe, label: 'Language', value: movie.originalLanguage.toUpperCase() });
  if (movie.networks && movie.networks.length > 0) rows.push({ icon: Tv, label: 'Network', value: movie.networks.join(', ') });
  if (movie.budget) rows.push({ icon: DollarSign, label: 'Budget', value: fmt(movie.budget) });
  if (movie.revenue) rows.push({ icon: DollarSign, label: 'Box Office', value: fmt(movie.revenue) });
  if (movie.productionCompanies && movie.productionCompanies.length > 0) rows.push({ icon: Building2, label: 'Production', value: movie.productionCompanies.join(', ') });

  if (rows.length === 0) return null;

  return (
    <section className="space-y-6">
      <h3 className="text-2xl font-headline font-bold flex items-center gap-3">
        <Info className="h-6 w-6 text-primary" /> Release Info
      </h3>
      <div className="bg-muted rounded-3xl p-8 border border-border grid grid-cols-1 sm:grid-cols-2 gap-6">
        {rows.map(r => <InfoRow key={r.label} {...r} />)}
      </div>
    </section>
  );
}

// ─── Seasons & episodes ────────────────────────────────────────────────────────

function EpisodeRow({
  ep,
  isWatched,
  onToggleWatched,
  onClick,
}: {
  ep: TvEpisode;
  isWatched: boolean;
  onToggleWatched: (e: React.MouseEvent) => void;
  onClick: () => void;
}) {
  const still = ep.still_path
    ? `https://image.tmdb.org/t/p/w300${ep.still_path}`
    : `https://picsum.photos/seed/${ep.id}/300/170`;

  return (
    <div className={`flex gap-4 p-4 rounded-2xl border transition-colors ${isWatched ? 'bg-gray-50 border-gray-100' : 'bg-white border-gray-100 hover:bg-gray-50'}`}>
      {/* Still — opens modal */}
      <button className="relative aspect-video w-28 shrink-0 rounded-xl overflow-hidden group" onClick={onClick}>
        <Image src={still} alt={ep.name} fill className="object-cover" />
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
          <Play className="h-6 w-6 fill-current text-white" />
        </div>
      </button>

      {/* Info — opens modal */}
      <button className="flex-1 min-w-0 space-y-1 text-left" onClick={onClick}>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-primary uppercase tracking-widest shrink-0">E{ep.episode_number}</span>
          <h5 className={`text-sm font-bold font-headline line-clamp-1 ${isWatched ? 'text-gray-400' : 'text-gray-900'}`}>{ep.name}</h5>
        </div>
        {ep.air_date && (
          <p className="text-[10px] text-gray-500 font-bold">{new Date(ep.air_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</p>
        )}
        {ep.overview && <p className="text-xs text-gray-500 line-clamp-2">{ep.overview}</p>}
        <div className="flex items-center gap-3 pt-1">
          {ep.vote_average > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-bold text-gray-900">
              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" /> {ep.vote_average.toFixed(1)}
            </span>
          )}
          {ep.runtime && <span className="text-[10px] text-gray-500 font-bold">{ep.runtime} min</span>}
        </div>
      </button>

      {/* Watched checkbox */}
      <button
        onClick={onToggleWatched}
        title={isWatched ? 'Remove from watched' : 'Mark as watched'}
        className={`shrink-0 self-center h-7 w-7 rounded-full border-2 flex items-center justify-center transition-all ${
          isWatched
            ? 'bg-primary border-primary text-white hover:bg-primary/80'
            : 'border-gray-300 bg-transparent hover:border-primary hover:bg-primary/5'
        }`}
      >
        {isWatched && <Check className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

function SeasonsSection({
  seasons,
  showTmdbId,
  watchedEpisodes,
  onToggleEpisodeWatched,
  onEpisodeClick,
}: {
  seasons: TvSeason[];
  showTmdbId: string;
  watchedEpisodes: Set<string>;
  onToggleEpisodeWatched: (seasonNumber: number, ep: TvEpisode) => void;
  onEpisodeClick: (ep: TvEpisode, seasonNumber: number) => void;
}) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const [cache, setCache] = useState<Record<number, TvEpisode[]>>({});
  const [expandLoading, setExpandLoading] = useState<number | null>(null);

  const toggle = async (n: number) => {
    if (expanded === n) { setExpanded(null); return; }
    if (cache[n]) { setExpanded(n); return; }
    setExpandLoading(n);
    try {
      const res = await fetch(`/api/tv/${showTmdbId}/season/${n}`);
      const data = await res.json() as { episodes?: TvEpisode[] };
      setCache(prev => ({ ...prev, [n]: data.episodes ?? [] }));
      setExpanded(n);
    } finally { setExpandLoading(null); }
  };

  const getProgress = (sn: number, total: number) => {
    let watched = 0;
    for (const k of watchedEpisodes) { if (k.startsWith(`S${sn}E`)) watched++; }
    return { watched, total };
  };

  return (
    <section className="space-y-6">
      <h3 className="text-2xl font-headline font-bold flex items-center gap-3">
        <Tv className="h-6 w-6 text-primary" /> Seasons & Episodes
      </h3>
      <div className="space-y-3">
        {seasons.map(season => {
          const sn = season.season_number;
          const isOpen = expanded === sn;
          const posterSrc = season.poster_path
            ? `https://image.tmdb.org/t/p/w154${season.poster_path}`
            : `https://picsum.photos/seed/season-${season.id}/154/231`;
          const { watched, total } = getProgress(sn, season.episode_count);
          const allWatched = total > 0 && watched >= total;

          return (
            <div key={season.id} className="rounded-3xl border border-border overflow-hidden">
              {/* Season header */}
              <div className="flex items-center gap-3 p-4 bg-muted">
                {/* Expand area */}
                <button
                  className="flex items-center gap-3 flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
                  onClick={() => toggle(sn)}
                >
                  <div className="relative w-10 aspect-[2/3] rounded-lg overflow-hidden shrink-0">
                    <Image src={posterSrc} alt={season.name} fill className="object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold font-headline text-sm">{season.name}</p>
                    <div className="flex items-center gap-2 flex-wrap mt-0.5">
                      <p className="text-xs text-muted-foreground font-bold">
                        {total} ep{season.air_date ? ` · ${season.air_date.slice(0, 4)}` : ''}
                      </p>
                      {watched > 0 && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${allWatched ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                          {allWatched ? '✓ All watched' : `${watched} / ${total}`}
                        </span>
                      )}
                    </div>
                  </div>
                </button>

                {/* Chevron */}
                <button onClick={() => toggle(sn)} className="text-muted-foreground hover:text-white transition-colors shrink-0">
                  {expandLoading === sn
                    ? <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    : isOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />
                  }
                </button>
              </div>

              {/* Episodes */}
              {isOpen && cache[sn] && (
                <div className="p-4 space-y-2 bg-gray-50">
                  {season.overview && <p className="text-sm text-gray-500 italic pb-2">{season.overview}</p>}
                  {cache[sn].map(ep => (
                    <EpisodeRow
                      key={ep.id}
                      ep={ep}
                      isWatched={watchedEpisodes.has(`S${sn}E${ep.episode_number}`)}
                      onToggleWatched={(e) => { e.stopPropagation(); onToggleEpisodeWatched(sn, ep); }}
                      onClick={() => onEpisodeClick(ep, sn)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ─── Lists helpers ────────────────────────────────────────────────────────────

interface UserList {
  id: string;
  title: string;
  isPrivate: boolean;
  createdAt: string;
  items: { movieId: string; title: string; poster: string; year: string; type: string }[];
}

function loadLists(): UserList[] {
  try { return JSON.parse(localStorage.getItem('user-lists') ?? '[]'); } catch { return []; }
}
function saveLists(lists: UserList[]) {
  try { localStorage.setItem('user-lists', JSON.stringify(lists)); } catch { /* ignore */ }
}

function AddToListButton({ movie, onRequireAuth }: { movie: Movie; onRequireAuth: (() => void) | null }) {
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<UserList[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPrivate, setNewPrivate] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Load from localStorage first for instant display, then sync from DB
    setLists(loadLists());
    fetch('/api/lists', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (!json?.data?.length) return;
        const dbLists: UserList[] = json.data.map((l: { id: string; name: string; isPublic: boolean; createdAt: string; items: { tmdbId: string; mediaType: string; title: string | null; poster: string | null; year: string | null }[] }) => ({
          id: l.id,
          title: l.name,
          isPrivate: !l.isPublic,
          createdAt: l.createdAt,
          items: l.items.map((i) => ({ movieId: i.tmdbId, title: i.title ?? '', poster: i.poster ?? '', year: i.year ?? '', type: i.mediaType === 'SHOW' ? 'show' : 'movie' })),
        }));
        saveLists(dbLists);
        setLists(dbLists);
      })
      .catch(() => { /* ignore */ });
  }, [open]);

  const addToList = (listId: string) => {
    const updated = lists.map(l => {
      if (l.id !== listId) return l;
      if (l.items.some(i => i.movieId === movie.id)) return l;
      return { ...l, items: [...l.items, { movieId: movie.id, title: movie.title, poster: movie.poster, year: movie.year, type: movie.type }] };
    });
    saveLists(updated);
    setLists(updated);
    toast({ title: 'Added to list' });
    // Sync to DB in background
    fetch(`/api/lists/${listId}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ tmdbId: movie.id, mediaType: movie.type === 'show' ? 'SHOW' : 'MOVIE', title: movie.title, poster: movie.poster, year: movie.year }),
    }).catch(() => { /* ignore */ });
  };

  const createAndAdd = async () => {
    if (!newTitle.trim()) return;
    const optimistic: UserList = { id: Date.now().toString(), title: newTitle.trim(), isPrivate: newPrivate, createdAt: new Date().toISOString(), items: [{ movieId: movie.id, title: movie.title, poster: movie.poster, year: movie.year, type: movie.type }] };
    const updated = [...lists, optimistic];
    saveLists(updated);
    setLists(updated);
    setCreateOpen(false);
    setNewTitle('');
    setNewPrivate(false);
    toast({ title: `Added to "${optimistic.title}"` });
    // Persist to DB
    try {
      const res = await fetch('/api/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: optimistic.title, isPublic: !optimistic.isPrivate }),
      });
      if (res.ok) {
        const json = await res.json();
        const realId: string = json.data?.id;
        if (realId) {
          // Update localStorage and state with real DB id, then add the item
          setLists(prev => {
            const next = prev.map(l => l.id === optimistic.id ? { ...l, id: realId } : l);
            saveLists(next);
            return next;
          });
          fetch(`/api/lists/${realId}/items`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ tmdbId: movie.id, mediaType: movie.type === 'show' ? 'SHOW' : 'MOVIE', title: movie.title, poster: movie.poster, year: movie.year }),
          }).catch(() => { /* ignore */ });
        }
      }
    } catch { /* ignore */ }
  };

  const isInList = (listId: string) => lists.find(l => l.id === listId)?.items.some(i => i.movieId === movie.id) ?? false;

  return (
    <>
      <Dialog open={open} onOpenChange={v => { if (v && onRequireAuth) { onRequireAuth(); return; } setOpen(v); }}>
        <DialogTrigger asChild>
          <Button variant="outline" className="h-14 px-8 rounded-2xl border-2 border-foreground bg-background text-foreground font-bold w-full md:w-auto text-base">
            <ListPlus className="h-5 w-5 mr-2" /> Add to List
          </Button>
        </DialogTrigger>
        <DialogContent className="rounded-3xl max-w-sm border-border">
          <DialogHeader><DialogTitle className="font-headline">Add to List</DialogTitle></DialogHeader>
          <div className="space-y-2 pt-2">
            {lists.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No lists yet. Create one below.</p>}
            {lists.map(l => (
              <button
                key={l.id}
                onClick={() => addToList(l.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors border border-primary ${isInList(l.id) ? 'bg-primary/10' : 'hover:bg-primary/5'}`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{l.title}</p>
                  <p className="text-xs text-muted-foreground">{l.items.length} {l.items.length === 1 ? 'title' : 'titles'} · {l.isPrivate ? 'Private' : 'Public'}</p>
                </div>
                {isInList(l.id) && <Check className="h-4 w-4 text-primary shrink-0" />}
              </button>
            ))}
            <Separator className="my-2" />
            <Button className="w-full h-11 rounded-xl" variant="outline" onClick={() => { setOpen(false); setCreateOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" /> Create New List
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="rounded-3xl max-w-sm border-border">
          <DialogHeader><DialogTitle className="font-headline">Create New List</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <input
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="List title…"
              className="w-full px-4 py-3 rounded-xl border border-border bg-muted/30 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <button
              onClick={() => setNewPrivate(p => !p)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-colors ${newPrivate ? 'border-primary/40 bg-primary/5' : 'border-border bg-muted/30'}`}
            >
              <span className="text-sm font-semibold">Private list</span>
              <div className={`w-10 h-5 rounded-full transition-colors flex items-center px-0.5 ${newPrivate ? 'bg-primary' : 'bg-foreground/20'}`}>
                <div className={`w-4 h-4 rounded-full bg-white transition-transform ${newPrivate ? 'translate-x-5' : 'translate-x-0'}`} />
              </div>
            </button>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button className="flex-1 rounded-xl" disabled={!newTitle.trim()} onClick={createAndAdd}>Create & Add</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Reviews section ──────────────────────────────────────────────────────────

interface UserReview { movieId: string; movieTitle: string; moviePoster: string; movieYear: string; content: string; rating: number; date: string; containsSpoiler?: boolean; }

interface CinephilersReview {
  id: string;
  user: { id: string; username: string; displayName: string | null; avatarUrl: string | null };
  body: string;
  containsSpoiler: boolean;
  rating: number | null;
  createdAt: string;
  isOwn: boolean;
}

function ReviewsSection({ movie, writeOpen, setWriteOpen, myReview, setMyReview, currentRating, onRate }: {
  movie: Movie;
  writeOpen: boolean;
  setWriteOpen: (v: boolean) => void;
  myReview: UserReview | null;
  setMyReview: (r: UserReview | null) => void;
  currentRating: number;      // the user's live rating for this title
  onRate: (score: number) => void;
}) {
  const [draftContent, setDraftContent] = useState('');
  const [draftRating, setDraftRating] = useState(0);
  const [draftSpoiler, setDraftSpoiler] = useState(false);
  const [hoverRating, setHoverRating] = useState(0);
  const [cinephilersReviews, setCinephilersReviews] = useState<CinephilersReview[]>([]);

  // Load Cinephilers reviews
  useEffect(() => {
    fetch(`/api/movies/reviews?tmdbId=${encodeURIComponent(movie.id)}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(json => { if (json?.data?.length) setCinephilersReviews(json.data); })
      .catch(() => {});
  }, [movie.id]);

  // Sync draft when dialog opens
  useEffect(() => {
    if (writeOpen) {
      setDraftContent(myReview?.content ?? '');
      // Reflect the user's live rating (they may have rated without reviewing).
      setDraftRating(currentRating || myReview?.rating || 0);
      setDraftSpoiler(myReview?.containsSpoiler ?? false);
    }
  }, [writeOpen, myReview, currentRating]);

  const submitReview = () => {
    if (!draftContent.trim()) return;
    const review: UserReview = {
      movieId: movie.id,
      movieTitle: movie.title,
      moviePoster: movie.poster,
      movieYear: movie.year,
      content: draftContent.trim(),
      rating: draftRating,
      date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      containsSpoiler: draftSpoiler,
    };
    try { localStorage.setItem(`review-${movie.id}`, JSON.stringify(review)); } catch { /* ignore */ }
    fetch('/api/reviews', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tmdbId: movie.id, mediaType: movie.type === 'show' ? 'SHOW' : 'MOVIE', body: review.content, containsSpoiler: draftSpoiler }),
    }).catch(() => { /* background sync */ });
    // Persist the rating too (rate + review in one go) when it was set/changed.
    if (draftRating > 0 && draftRating !== currentRating) onRate(draftRating);
    setMyReview(review);
    setWriteOpen(false);
    logActivity({ action: 'reviewed', contentId: movie.id, contentTitle: movie.title, contentPoster: movie.poster, contentYear: movie.year });
    toast({ title: 'Review saved' });
  };

  const deleteReview = () => {
    if (!window.confirm('Delete your review? This cannot be undone.')) return;
    try { localStorage.removeItem(`review-${movie.id}`); } catch { /* ignore */ }
    const own = cinephilersReviews.find(r => r.isOwn);
    if (own) {
      fetch(`/api/reviews/${own.id}`, { method: 'DELETE', credentials: 'include' }).catch(() => { /* background sync */ });
      setCinephilersReviews(prev => prev.filter(r => !r.isOwn));
    }
    setMyReview(null);
    toast({ title: 'Review deleted' });
  };

  const allReviews = movie.reviews ?? [];
  const previewReviews = cinephilersReviews.slice(0, 3);

  return (
    <section className="space-y-6">
      {/* ── Cinephilers Reviews ── */}
      {cinephilersReviews.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-headline font-bold">Cinephilers Reviews</h3>
            <Link
              href={`/movie/${movie.id}/reviews`}
              className="text-xs text-primary border border-primary/30 rounded-full px-3 py-1 hover:bg-primary/10 transition-colors font-semibold"
            >
              See All
            </Link>
          </div>
          <div className="space-y-4">
            {previewReviews.map(r => (
              <div key={r.id} className="bg-card rounded-3xl border border-border p-5 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <Link
                    href={r.isOwn ? '/profile' : `/profile/${r.user.username}`}
                    className="flex items-center gap-3 min-w-0 group"
                  >
                    <div className="h-9 w-9 rounded-2xl bg-primary/20 overflow-hidden flex items-center justify-center shrink-0">
                      {r.user.avatarUrl
                        ? <img src={r.user.avatarUrl} alt={r.user.username} className="w-full h-full object-cover" />
                        : <span className="text-primary font-bold text-xs">{(r.user.displayName ?? r.user.username).slice(0, 2).toUpperCase()}</span>
                      }
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-sm truncate group-hover:text-primary transition-colors">
                        {r.user.displayName ?? r.user.username}
                        {r.isOwn && <span className="ml-1.5 text-[10px] text-primary font-bold uppercase tracking-wider">You</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">{relativeTime(r.createdAt)}</p>
                    </div>
                  </Link>
                  {r.rating !== null && (
                    <div className="flex items-center gap-1 bg-yellow-400/10 px-2.5 py-1 rounded-full shrink-0">
                      <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                      <span className="text-sm font-black text-yellow-400">{r.rating}/10</span>
                    </div>
                  )}
                </div>
                <SpoilerWrap isSpoiler={r.containsSpoiler}>
                  <p className="text-sm text-foreground/90 leading-relaxed italic">
                    &ldquo;{r.body}&rdquo;
                  </p>
                </SpoilerWrap>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-2xl font-headline font-bold">Community Reviews</h3>
        {allReviews.length > 0 && (
          <Link
            href={`/movie/${movie.id}/community-reviews`}
            className="text-xs text-primary border border-primary/30 rounded-full px-3 py-1 hover:bg-primary/10 transition-colors font-semibold"
          >
            See All
          </Link>
        )}
      </div>

      {/* My review */}
      {myReview && (
        <div className="bg-primary/5 border border-primary/20 p-5 rounded-2xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-widest text-primary">Your Review</span>
            <div className="flex items-center gap-3">
              {myReview.rating > 0 && (
                <div className="flex items-center gap-1 text-yellow-500 text-xs font-black">
                  <Star className="h-3 w-3 fill-current" /> {myReview.rating}
                </div>
              )}
              <button
                onClick={deleteReview}
                className="h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                aria-label="Delete review"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <p className="text-sm text-foreground leading-relaxed italic">&ldquo;{myReview.content}&rdquo;</p>
          <p className="text-[10px] text-muted-foreground">{myReview.date}</p>
        </div>
      )}

      {/* Community preview */}
      {allReviews.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {allReviews.slice(0, 2).map(r => (
            <div key={r.id} className="bg-muted/50 p-5 rounded-2xl border border-border space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={r.userAvatar} />
                    <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">{r.userName.charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div>
                    <span className="text-sm font-bold font-headline block">{r.userName}</span>
                    <span className="text-[10px] text-muted-foreground font-bold">{r.date}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 bg-yellow-400/10 text-yellow-500 px-2.5 py-1 rounded-full text-xs font-black">
                  <Star className="h-3 w-3 fill-current" /> {r.rating}
                </div>
              </div>
              <p className="text-sm text-foreground line-clamp-3 italic leading-relaxed">&ldquo;{r.content}&rdquo;</p>
            </div>
          ))}
        </div>
      )}

      {/* Write / edit review dialog */}
      <Dialog open={writeOpen} onOpenChange={setWriteOpen}>
        <DialogContent className="max-w-lg rounded-3xl border-border">
          <DialogHeader>
            <DialogTitle className="font-headline text-xl">{myReview ? 'Edit Your Review' : 'Write a Review'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 pt-2">
            {/* Rating — rate + review in one go */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">Your Rating</p>
              <div className="flex items-center gap-0.5" onMouseLeave={() => setHoverRating(0)}>
                {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setDraftRating(n === draftRating ? 0 : n)}
                    onMouseEnter={() => setHoverRating(n)}
                    className="p-0.5"
                    aria-label={`Rate ${n} out of 10`}
                  >
                    <Star className={`h-5 w-5 transition-colors ${(hoverRating || draftRating) >= n ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground/40'}`} />
                  </button>
                ))}
                <span className="ml-2 text-sm font-bold text-foreground w-12">{draftRating > 0 ? `${draftRating}/10` : ''}</span>
              </div>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">Your Thoughts</p>
              <textarea
                value={draftContent}
                onChange={e => setDraftContent(e.target.value)}
                placeholder={`What did you think of ${movie.title}?`}
                className="w-full h-36 p-3 rounded-xl border border-border bg-muted/30 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            {/* Spoiler toggle — flagged reviews are blurred until a reader taps to reveal */}
            <button
              type="button"
              onClick={() => setDraftSpoiler(v => !v)}
              className="flex items-center gap-2.5 w-full text-left"
            >
              <span className={`h-5 w-5 rounded-md border-2 flex items-center justify-center transition-colors shrink-0 ${draftSpoiler ? 'bg-yellow-500 border-yellow-500' : 'border-border'}`}>
                {draftSpoiler && <Check className="h-3.5 w-3.5 text-black" />}
              </span>
              <span className="text-sm font-semibold text-foreground">This review contains spoilers</span>
            </button>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setWriteOpen(false)}>Cancel</Button>
              <Button className="flex-1 rounded-xl" disabled={!draftContent.trim()} onClick={submitReview}>Save Review</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

// ─── Friends' Ratings ─────────────────────────────────────────────────────────

interface FriendRatingEntry {
  user: { id: string; username: string; displayName: string | null; avatarUrl: string | null };
  rating: number | null;
  watched: boolean;
  reviewed: boolean;
}

const FRIENDS_VISIBLE = 6;

function FriendsRatings({ tmdbId }: { tmdbId: string }) {
  const { user: authUser } = useAuth();
  const [entries, setEntries] = useState<FriendRatingEntry[]>([]);

  useEffect(() => {
    if (!authUser) return;
    fetchWithAuth(`/api/movies/friends-ratings?tmdbId=${encodeURIComponent(tmdbId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(json => { if (json?.data?.length) setEntries(json.data); })
      .catch(() => {});
  }, [tmdbId, authUser]);

  if (!authUser || entries.length === 0) return null;

  const visible = entries.slice(0, FRIENDS_VISIBLE);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-headline font-bold flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" /> Friends
        </h3>
        <Link
          href={`/movie/${tmdbId}/friends`}
          className="text-xs text-primary border border-primary/30 rounded-full px-3 py-1 hover:bg-primary/10 transition-colors font-semibold"
        >
          See All
        </Link>
      </div>

      <div className="flex gap-3">
        {visible.map(e => (
          <Link key={e.user.id} href={`/profile/${e.user.username}`} className="shrink-0 group">
            <div className="relative h-16 w-16 rounded-2xl bg-primary/20 overflow-hidden flex items-center justify-center">
              {e.user.avatarUrl
                ? <img src={e.user.avatarUrl} alt={e.user.username} className="w-full h-full object-cover" />
                : <span className="text-primary font-bold text-sm">{(e.user.displayName ?? e.user.username).slice(0, 2).toUpperCase()}</span>
              }
            </div>
          </Link>
        ))}
        {entries.length > FRIENDS_VISIBLE && (
          <Link href={`/movie/${tmdbId}/friends`} className="shrink-0">
            <div className="h-16 w-16 rounded-2xl bg-muted border border-border flex items-center justify-center">
              <span className="text-xs font-bold text-muted-foreground">+{entries.length - FRIENDS_VISIBLE}</span>
            </div>
          </Link>
        )}
      </div>
    </section>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

// This route serves every media id, so an episode id (`tmdb-tv-{n}-S{s}E{e}`)
// renders the full episode page instead. That keeps episode links from watch
// history / ratings working and gives episodes a shareable URL of their own.
export default function MovieDetailPage() {
  const { id } = useParams<{ id: string }>();
  const ep = parseEpisodeId(id);
  if (ep) return <EpisodePage showTmdbId={ep.showId} season={ep.season} episodeNumber={ep.episode} />;
  return <MovieDetailInner />;
}

function MovieDetailInner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [movie, setMovie] = useState<Movie | null>(null);
  const [loading, setLoading] = useState(true);
  const [isWatched, setIsWatched] = useState(false);
  const [isInWatchlist, setIsInWatchlist] = useState(false);
  const [userRating, setUserRating] = useState(0);
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const [watchedEpisodes, setWatchedEpisodes] = useState<Set<string>>(new Set());
  const [writeReviewOpen, setWriteReviewOpen] = useState(false);
  const [myReview, setMyReview] = useState<UserReview | null>(null);
  const [authGate, setAuthGate] = useState<string | null>(null);
  const [cineRating, setCineRating] = useState<CinephilersRating | null>(null);
  // Diary: how many times this title was watched + the latest date. Loaded
  // from the server (never mirrored to localStorage). rewatchDateOpen shows
  // the optional backdate picker; lastLoggedEventId powers the Undo.
  const [seenCount, setSeenCount] = useState<number | null>(null);
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null);
  const [rewatchDateOpen, setRewatchDateOpen] = useState(false);
  const [rewatchDate, setRewatchDate] = useState('');
  const [rewatchBusy, setRewatchBusy] = useState(false);
  const [lastLoggedEventId, setLastLoggedEventId] = useState<string | null>(null);
  // Bumped by the error screen's Try Again button to re-run the title load.
  const [reloadKey, setReloadKey] = useState(0);
  const [rateSheetOpen, setRateSheetOpen] = useState(false);

  const { user: authUser } = useAuth();

  const syncDb = useCallback((method: string, path: string, body?: object) => {
    fetchWithAuth(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }).catch(() => { /* background sync — ignore errors */ });
  }, []);

  const loadCineRating = useCallback((mediaType: 'MOVIE' | 'SHOW') => {
    fetch(`/api/movies/rating?tmdbId=${encodeURIComponent(id)}&mediaType=${mediaType}`)
      .then(r => r.ok ? r.json() : null)
      .then(json => { if (json?.data) setCineRating(json.data as CinephilersRating); })
      .catch(() => { /* ignore */ });
  }, [id]);

  // Save a rating (from the RatingSheet). Additions are local-first with a
  // background sync; rating also marks the title watched, mirroring the
  // watched button (the server does the same on its side).
  const applyRating = (i: number) => {
    setUserRating(i);
    saveMovieRating(id, i);
    syncDb('POST', '/api/ratings', { tmdbId: id, mediaType: movie?.type === 'show' ? 'SHOW' : 'MOVIE', score: i });
    if (movie) logActivity({ action: 'rated', contentId: id, contentTitle: movie.title, contentPoster: movie.poster, contentYear: movie.year, rating: i });
    toast({ title: `You rated it ${i}/10!` });
    window.dispatchEvent(new CustomEvent('cinephilers-rating-changed', { detail: { id, rating: i } }));
    if (!isWatched) {
      try {
        localStorage.setItem(`watched-${id}`, 'true');
        if (movie?.type === 'show') {
          localStorage.setItem(`show-status-${id}`, 'completed');
          if (movie.totalEpisodes && movie.totalEpisodes > 0) localStorage.setItem(`watched-show-eps-${id}`, String(movie.totalEpisodes));
        }
      } catch { /* ignore */ }
      setIsWatched(true);
      syncDb('POST', '/api/watched', { tmdbId: id, mediaType: movie?.type === 'show' ? 'SHOW' : 'MOVIE' });
      if (movie) {
        if (movie.type !== 'show') appendWatchLog({ id, type: 'movie', genre: movie.genre ?? '', language: movie.originalLanguage ?? '' });
        recordWatchedAt(id);
        recordManualWatch(id);
        logActivity({ action: 'watched', contentId: id, contentTitle: movie.title, contentPoster: movie.poster, contentYear: movie.year });
      }
      window.dispatchEvent(new Event('cinephilers-watched-changed'));
    }
  };

  // Remove the rating. Await the server delete and confirm it before clearing
  // locally — a fire-and-forget delete that silently fails leaves the row in
  // the DB and the next DB->local sync restores it (see sync invariant).
  const removeRatingServerFirst = async () => {
    const mediaType = movie?.type === 'show' ? 'SHOW' : 'MOVIE';
    try {
      const res = await fetchWithAuth(`/api/ratings/${id}?mediaType=${mediaType}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      toast({ title: "Couldn't remove the rating. Check your connection and try again.", variant: 'destructive' });
      return;
    }
    setUserRating(0);
    try { localStorage.removeItem(`movie-rating-${id}`); } catch { /* ignore */ }
    removeActivity('rated', id);
    toast({ title: 'Rating removed' });
    window.dispatchEvent(new CustomEvent('cinephilers-rating-changed', { detail: { id, rating: null } }));
  };

  // Watchlist removal for the sheet's checkbox — server first, same invariant.
  const removeFromWatchlistServerFirst = async () => {
    const mediaType = movie?.type === 'show' ? 'SHOW' : 'MOVIE';
    const res = await fetchWithAuth(`/api/watchlist/${id}?mediaType=${mediaType}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    try {
      localStorage.removeItem(`watchlist-${id}`);
      const twin = legacyTwin(id);
      if (twin) localStorage.removeItem(`watchlist-${twin}`);
    } catch { /* ignore */ }
    removeActivity('watchlist', id);
    setIsInWatchlist(false);
  };

  useEffect(() => {
    if (!id) return;
    ensureSignupDate();
    try {
      setIsWatched(localStorage.getItem(`watched-${id}`) === 'true');
      setIsInWatchlist(localStorage.getItem(`watchlist-${id}`) !== null);
      const saved = localStorage.getItem(`movie-rating-${id}`);
      const rev = localStorage.getItem(`review-${id}`);
      if (rev) setMyReview(JSON.parse(rev));
      if (saved) setUserRating(parseInt(saved, 10));
      // Load watched episodes from localStorage first (fast)
      const indexRaw = localStorage.getItem(`watched-eps-index-${id}`);
      const watched = new Set<string>(indexRaw ? JSON.parse(indexRaw) : []);
      setWatchedEpisodes(watched);
      // Then merge with DB (authoritative across devices) — fire-and-forget
      fetch(`/api/watched/episodes/${encodeURIComponent(id)}`, { credentials: 'include' })
        .then(r => r.ok ? r.json() : null)
        .then(json => {
          if (!json?.data) return;
          const dbKeys: string[] = json.data;
          if (dbKeys.length === 0) return;
          setWatchedEpisodes(prev => {
            const merged = new Set(prev);
            let changed = false;
            for (const k of dbKeys) { if (!merged.has(k)) { merged.add(k); changed = true; } }
            if (!changed) return prev;
            // Update index in localStorage
            try { localStorage.setItem(`watched-eps-index-${id}`, JSON.stringify([...merged])); } catch { /* ignore */ }
            return merged;
          });
        })
        .catch(() => { /* ignore */ });
    } catch { /* ignore */ }
    // Transient failures (a rate-limit blip, a TMDB hiccup, flaky mobile
    // network) must never dead-end the page in "Title not found" — retry a
    // couple of times with a short backoff before giving up.
    let cancelled = false;
    (async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const r = await fetch(`/api/movies/${id}`);
          const data: Movie & { error?: string } = await r.json();
          if (cancelled) return;
          if (!data.error) {
            setMovie(data);
            loadCineRating(data.type === 'show' ? 'SHOW' : 'MOVIE');
            // Cache metadata for profile/watchlist lookups
            try {
              localStorage.setItem(`meta-${data.id}`, JSON.stringify({
                title: data.title,
                poster: data.poster,
                backdrop: data.backdrop,
                year: data.year,
                genre: data.genre,
                language: data.originalLanguage,
                description: data.description,
                type: data.type,
                tmdbRating: data.rating,
              }));
            } catch { /* ignore */ }
            // Track recently viewed in localStorage
            try {
              const stored = localStorage.getItem('recently-viewed');
              const viewed: { id: string; title: string; poster: string; year: string; type: string }[] =
                stored ? JSON.parse(stored) : [];
              const entry = { id: data.id, title: data.title, poster: data.poster, year: data.year, type: data.type, rating: data.rating };
              const filtered = viewed.filter(v => v.id !== data.id);
              localStorage.setItem('recently-viewed', JSON.stringify([entry, ...filtered].slice(0, 100)));
            } catch { /* ignore */ }
            setLoading(false);
            return;
          }
        } catch { /* network error — fall through to retry */ }
        if (attempt < 2) await new Promise(res => setTimeout(res, 1200 * (attempt + 1)));
      }
      if (!cancelled) { setMovie(null); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [id, loadCineRating, reloadKey]);

  // Load this title's diary summary (seen count + last watch date) once we
  // know the media type. Server-only data — deliberately not in localStorage.
  useEffect(() => {
    if (!authUser || !movie || !isWatched) { setSeenCount(null); setLastSeenAt(null); return; }
    const mediaType = movie.type === 'show' ? 'SHOW' : 'MOVIE';
    fetchWithAuth(`/api/diary?tmdbId=${encodeURIComponent(id)}&mediaType=${mediaType}&limit=1`)
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (!json?.data) return;
        setSeenCount(json.data.total ?? null);
        setLastSeenAt(json.data.items?.[0]?.watchedAt ?? null);
      })
      .catch(() => { /* ignore */ });
  }, [authUser, movie, isWatched, id]);

  const logRewatch = async (dateStr?: string) => {
    if (!movie || rewatchBusy) return;
    setRewatchBusy(true);
    try {
      const res = await fetchWithAuth('/api/diary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tmdbId: id,
          mediaType: movie.type === 'show' ? 'SHOW' : 'MOVIE',
          ...(dateStr ? { watchedAt: new Date(`${dateStr}T12:00:00`).toISOString() } : {}),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setSeenCount(json.data?.count ?? (seenCount ?? 1) + 1);
      const loggedAt = json.data?.event?.watchedAt ?? null;
      if (loggedAt && (!lastSeenAt || new Date(loggedAt) > new Date(lastSeenAt))) setLastSeenAt(loggedAt);
      setLastLoggedEventId(json.data?.event?.id ?? null);
      setRewatchDateOpen(false);
      setRewatchDate('');
      toast({ title: 'Rewatch logged' });
    } catch {
      toast({ title: "Couldn't log the rewatch. Check your connection and try again.", variant: 'destructive' });
    } finally {
      setRewatchBusy(false);
    }
  };

  const undoRewatch = async () => {
    if (!lastLoggedEventId || rewatchBusy) return;
    setRewatchBusy(true);
    try {
      const res = await fetchWithAuth(`/api/diary/${lastLoggedEventId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setSeenCount(json.data?.remaining ?? null);
      setLastLoggedEventId(null);
      toast({ title: 'Rewatch removed' });
    } catch {
      toast({ title: "Couldn't undo. Check your connection and try again.", variant: 'destructive' });
    } finally {
      setRewatchBusy(false);
    }
  };

  // Refetch the Cinephilers aggregate whenever this user rates/unrates, so the
  // displayed score reflects their own just-cast vote without a page reload.
  useEffect(() => {
    if (!movie) return;
    const handler = () => loadCineRating(movie.type === 'show' ? 'SHOW' : 'MOVIE');
    window.addEventListener('cinephilers-rating-changed', handler);
    return () => window.removeEventListener('cinephilers-rating-changed', handler);
  }, [movie, loadCineRating]);

  // ─── Episode watch helpers ─────────────────────────────────────────────────

  const epKey = (sn: number, epNum: number) => `S${sn}E${epNum}`;

  const toggleEpisodeWatched = useCallback((sn: number, ep: TvEpisode) => {
    if (!authUser) { setAuthGate('track episodes'); return; }
    const key   = epKey(sn, ep.episode_number);
    const lsKey = `watched-ep-${id}-${key}`;
    const logId = `${id}-${key}`;
    const nowWatched = !watchedEpisodes.has(key);

    setWatchedEpisodes(prev => {
      const next = new Set(prev);
      nowWatched ? next.add(key) : next.delete(key);
      return next;
    });

    if (nowWatched) {
      try {
        localStorage.setItem(lsKey, 'true');
        const indexRaw = localStorage.getItem(`watched-eps-index-${id}`);
        const index: string[] = indexRaw ? JSON.parse(indexRaw) : [];
        if (!index.includes(key)) localStorage.setItem(`watched-eps-index-${id}`, JSON.stringify([...index, key]));
      } catch { /* ignore */ }
      appendWatchLog({ id: logId, type: 'episode', genre: movie?.genre ?? '', language: movie?.originalLanguage ?? '' });
      // Mirror the movie watched button: stamp the watched date + manual tier so
      // episodes sort newest-first above imports, and log to the activity feed.
      recordWatchedAt(logId);
      recordManualWatch(logId);
      logActivity({ action: 'watched', contentId: logId, contentTitle: ep.name, contentPoster: movie?.poster ?? '', contentYear: movie?.year ?? '' });
      toast({ title: `${ep.name} marked as watched` });
    } else {
      try {
        localStorage.removeItem(lsKey);
        const indexRaw = localStorage.getItem(`watched-eps-index-${id}`);
        const index: string[] = indexRaw ? JSON.parse(indexRaw) : [];
        localStorage.setItem(`watched-eps-index-${id}`, JSON.stringify(index.filter(k => k !== key)));
      } catch { /* ignore */ }
      removeFromWatchLog(logId, 'episode');
      removeManualWatch(logId);
      removeActivity('watched', logId);
      toast({ title: `${ep.name} removed from watched` });
    }
    // Sync to DB in background
    syncDb('POST', '/api/watched/episodes', { showTmdbId: id, season: sn, episode: ep.episode_number, watched: nowWatched });
  }, [id, watchedEpisodes, movie, syncDb, authUser]);

  if (loading) return <DetailSkeleton />;

  if (!movie) return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 pb-32">
      <div className="h-20 w-20 rounded-3xl bg-muted border border-border flex items-center justify-center">
        <Film className="h-10 w-10 text-muted-foreground" />
      </div>
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-headline font-bold">Title not found</h1>
        <p className="text-muted-foreground">This movie or show could not be loaded.</p>
      </div>
      <div className="flex items-center gap-3">
        <Button variant="outline" className="rounded-full border-border" onClick={() => router.back()}>
          <ChevronLeft className="h-4 w-4 mr-2" /> Go Back
        </Button>
        <Button className="rounded-full" onClick={() => { setLoading(true); setReloadKey(k => k + 1); }}>
          Try Again
        </Button>
      </div>
    </main>
  );

  const firstTrailer = movie.trailers?.[0];
  const showTmdbId = movie.id.replace('tmdb-tv-', '').replace('tmdb-', '');

  return (
    <main className="min-h-screen pb-32 bg-background">
      {/* Backdrop */}
      <section className="relative w-full h-[50vh] bg-black">
        {movie.backdrop && <Image src={movie.backdrop} alt={movie.title} fill className="object-cover opacity-60" />}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />

        <header className="absolute top-0 left-0 right-0 px-6 pb-6 pt-[calc(env(safe-area-inset-top)+1.5rem)] flex justify-between items-center z-20">
          <Button variant="outline" size="icon" className="rounded-full bg-white text-black border-white/80 hover:bg-white/90" onClick={() => router.back()}>
            <ChevronLeft className="h-6 w-6" />
          </Button>
          <Button
            variant="outline" size="icon"
            className="rounded-full bg-white text-black border-white/80 hover:bg-white/90"
            onClick={async () => {
              // Native share sheet = one tap to WhatsApp/IG with a real title,
              // which is exactly how a film gets recommended to a friend. The
              // friend taps the link and lands on this page. Clipboard fallback
              // on desktop / unsupported browsers.
              const shareText = `${movie.title}${movie.year ? ` (${movie.year})` : ''} on Cinephilers`;
              try {
                if (navigator.share) {
                  await navigator.share({ title: shareText, text: shareText, url: window.location.href });
                } else {
                  await navigator.clipboard.writeText(window.location.href);
                  toast({ title: 'Link copied!' });
                }
              } catch { /* user dismissed the share sheet */ }
            }}
          >
            <Share2 className="h-5 w-5" />
          </Button>
        </header>

        {/* Play trailer overlay */}
        {firstTrailer && (
          <Dialog>
            <DialogTrigger asChild>
              <div className="absolute inset-0 flex items-center justify-center cursor-pointer group">
                <div className="flex flex-col items-center gap-4 transition-transform active:scale-95">
                  <div className="h-20 w-20 rounded-full bg-white flex items-center justify-center shadow-2xl group-hover:bg-white/90 group-hover:scale-110 transition-all">
                    <Play className="h-10 w-10 fill-black text-black ml-1" />
                  </div>
                  <span className="text-sm font-bold tracking-widest uppercase text-white/80 group-hover:text-white">Watch Trailer</span>
                </div>
              </div>
            </DialogTrigger>
            <DialogContent className="max-w-3xl rounded-3xl p-2 border-white/10 bg-black">
              <div className="aspect-video w-full">
                <iframe
                  src={`https://www.youtube.com/embed/${firstTrailer.key}?autoplay=1&rel=0`}
                  className="w-full h-full rounded-2xl"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            </DialogContent>
          </Dialog>
        )}
      </section>

      <div className="px-6 space-y-12">
        {/* Poster & Overview */}
        <section className="flex flex-col md:flex-row gap-8 -mt-20 relative z-10">
          <div className="shrink-0 mx-auto md:mx-0">
            <div className="relative aspect-[2/3] w-48 md:w-64 rounded-[2rem] overflow-hidden shadow-2xl border-4 border-background ring-1 ring-border bg-muted">
              {movie.poster ? (
                <Image src={movie.poster} alt={movie.title} fill className="object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Film className="h-20 w-20 text-primary/60" />
                </div>
              )}
            </div>
          </div>
          <div className="flex-1 flex flex-col justify-end gap-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="text-[10px] font-bold uppercase tracking-widest">{movie.type === 'show' ? 'TV Show' : 'Movie'}</Badge>
              <Badge variant="outline" className="text-[10px] border-border">{movie.genre}</Badge>
            </div>
            <h1 className="text-4xl md:text-5xl font-headline font-bold leading-tight">{movie.title}</h1>
            {movie.tagline && <p className="text-base text-primary italic font-medium">&ldquo;{movie.tagline}&rdquo;</p>}
            <div className="flex flex-wrap items-center gap-4 text-sm font-bold text-muted-foreground">
              <span className="flex items-center gap-1.5"><Calendar className="h-4 w-4 text-primary" />{movie.year}</span>
              {movie.runtime && <span className="flex items-center gap-1.5"><Clock className="h-4 w-4 text-primary" />{Math.floor(movie.runtime / 60)}h {movie.runtime % 60}m</span>}
              {movie.episodeRuntime && <span className="flex items-center gap-1.5"><Clock className="h-4 w-4 text-primary" />{movie.episodeRuntime} min/ep</span>}
              {movie.director && <span className="flex items-center gap-1.5"><Film className="h-4 w-4 text-primary" />Dir. {movie.director}</span>}
            </div>
            <p className="text-foreground leading-relaxed font-medium text-base">{movie.description}</p>

            {/* Write a review bar */}
            <button
              onClick={() => { if (!authUser) { setAuthGate('write reviews'); return; } setWriteReviewOpen(true); }}
              className="flex items-center gap-3 w-full px-4 py-3 rounded-2xl border-2 border-foreground/15 bg-muted/40 hover:border-foreground/30 hover:bg-muted/60 transition-colors text-left"
            >
              <PenLine className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground">
                {myReview ? `Your review: "${myReview.content.slice(0, 50)}${myReview.content.length > 50 ? '…' : ''}"` : `Share your thoughts on ${movie.title}…`}
              </span>
            </button>
          </div>
        </section>

        {/* Guest join banner — the movie page is where shared links land, so a
            logged-out visitor from a friend's share sees the pitch and a way in
            (not just an auth popup when they happen to tap something). */}
        {!authUser && (
          <section className="rounded-[2rem] border border-primary/20 bg-primary/10 p-6 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1 space-y-1">
              <p className="font-headline font-bold text-lg">Track this and everything you watch</p>
              <p className="text-sm text-muted-foreground">Log films <span className="text-foreground font-semibold">and shows</span>, rate them, and see what your friends are watching. Free — import your Letterboxd or IMDb history in one tap.</p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button asChild className="rounded-xl font-bold h-11 px-6"><Link href="/signup">Join free</Link></Button>
              <Button asChild variant="outline" className="rounded-xl font-bold h-11 px-5 border-border"><Link href="/login">Log in</Link></Button>
            </div>
          </section>
        )}

        {/* Action Buttons */}
        <section className="flex flex-wrap gap-4">
          <Button
            variant={isInWatchlist ? 'default' : 'outline'}
            className={`h-14 px-8 rounded-2xl font-bold w-full md:w-auto text-base transition-all ${isInWatchlist ? 'bg-primary border-primary' : 'border-2 border-foreground bg-background text-foreground'}`}
            onClick={async () => {
              if (!authUser) { setAuthGate('add movies to your watchlist'); return; }
              const next = !isInWatchlist;
              const mediaType = movie!.type === 'show' ? 'SHOW' : 'MOVIE';

              // Confirm the server write before touching any local state, so a
              // silently failed sync can't leave the DB and local copy out of step
              // (a removed item would reappear, or an added one vanish, on the next
              // DB->local sync). Wait for the server, and bail without changing
              // anything local if it didn't take.
              try {
                const res = next
                  ? await fetchWithAuth('/api/watchlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tmdbId: id, mediaType }) })
                  : await fetchWithAuth(`/api/watchlist/${id}?mediaType=${mediaType}`, { method: 'DELETE' });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
              } catch {
                toast({ title: next ? "Couldn't add to watchlist. Check your connection and try again." : "Couldn't remove from watchlist. Check your connection and try again.", variant: 'destructive' });
                return;
              }

              setIsInWatchlist(next);
              try {
                if (next) {
                  localStorage.setItem(`watchlist-${id}`, JSON.stringify({
                    id: movie!.id,
                    title: movie!.title,
                    poster: movie!.poster,
                    backdrop: movie!.backdrop,
                    year: movie!.year,
                    genre: movie!.genre,
                    description: movie!.description,
                    type: movie!.type,
                    tmdbRating: movie!.rating,
                  }));
                  recordAddedAt(id);
                } else {
                  localStorage.removeItem(`watchlist-${id}`);
                }
              } catch { /* ignore */ }
              if (next && movie) {
                logActivity({ action: 'watchlist', contentId: id, contentTitle: movie.title, contentPoster: movie.poster, contentYear: movie.year });
              } else {
                removeActivity('watchlist', id);
              }
              toast({ title: next ? 'Added to watchlist' : 'Removed from watchlist' });
            }}
          >
            {isInWatchlist ? <Check className="h-5 w-5 mr-2" /> : <Plus className="h-5 w-5 mr-2" />}
            {isInWatchlist ? 'In Watchlist' : 'Add to Watchlist'}
          </Button>
          <Button
            variant={isWatched ? 'default' : 'outline'}
            className={`h-14 px-8 rounded-2xl font-bold w-full md:w-auto text-base transition-all ${isWatched ? 'bg-accent border-accent' : 'border-2 border-foreground bg-background text-foreground'}`}
            onClick={async () => {
              if (!authUser) { setAuthGate('mark movies as watched'); return; }
              const next = !isWatched;
              const watchedMediaType = movie!.type === 'show' ? 'SHOW' : 'MOVIE';

              // Confirm the server write before touching any local state. A
              // fire-and-forget sync that silently fails leaves the DB and the local
              // copy out of step, so a removed item reappears (or a marked one
              // vanishes) on the next DB->local sync. Wait for the server, and bail
              // without changing anything local if it didn't take.
              try {
                const res = next
                  ? await fetchWithAuth('/api/watched', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tmdbId: id, mediaType: watchedMediaType }) })
                  : await fetchWithAuth(`/api/watched/${id}?mediaType=${watchedMediaType}`, { method: 'DELETE' });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
              } catch {
                toast({ title: next ? "Couldn't mark as watched. Check your connection and try again." : "Couldn't remove from watched. Check your connection and try again.", variant: 'destructive' });
                return;
              }

              setIsWatched(next);
              try {
                localStorage.setItem(`watched-${id}`, String(next));
                if (movie?.type === 'show') {
                  if (next) {
                    localStorage.setItem(`show-status-${id}`, 'completed');
                    // Store episode count so badge stats can credit whole-show watches
                    if (movie.totalEpisodes && movie.totalEpisodes > 0) {
                      localStorage.setItem(`watched-show-eps-${id}`, String(movie.totalEpisodes));
                    }
                  } else {
                    localStorage.removeItem(`watched-show-eps-${id}`);
                  }
                }
              } catch { /* ignore */ }
              if (next && movie) {
                // Only movies belong in the movie watch-log; whole-show watches are
                // credited to the episode count via the watched-show-eps key above.
                if (movie.type !== 'show') {
                  appendWatchLog({
                    id,
                    type: 'movie',
                    genre: movie.genre ?? '',
                    language: movie.originalLanguage ?? '',
                  });
                }
                // Stamp a watched date for everything (incl. shows) so watch history can
                // sort it newest-first — the movie watch-log alone doesn't cover shows.
                recordWatchedAt(id);
                // Mark it as a hand-tapped watch so history ranks it above imports.
                recordManualWatch(id);
                logActivity({ action: 'watched', contentId: id, contentTitle: movie.title, contentPoster: movie.poster, contentYear: movie.year });
              } else {
                removeFromWatchLog(id, 'movie');
                removeManualWatch(id);
                removeActivity('watched', id);
              }
              window.dispatchEvent(new Event('cinephilers-watched-changed'));
              toast({ title: next ? 'Marked as watched' : 'Removed from watched' });
            }}
          >
            {isWatched ? <Check className="h-5 w-5 mr-2" /> : <Play className="h-5 w-5 mr-2" />}
            {isWatched ? 'Watched' : 'Mark as Watched'}
          </Button>
          <AddToListButton movie={movie} onRequireAuth={authUser ? null : () => setAuthGate('save movies to lists')} />
        </section>

        {/* Diary / rewatch strip — every tap logs a new viewing (an event, not a toggle) */}
        {authUser && isWatched && (
          <section className="flex flex-wrap items-center gap-3 -mt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground font-semibold">
              <Repeat className="h-4 w-4 text-primary" />
              {seenCount !== null && seenCount > 0 ? (
                <span>
                  Seen {seenCount}&times;
                  {lastSeenAt && (
                    <> &middot; last {new Date(lastSeenAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</>
                  )}
                </span>
              ) : (
                <span>Watched it again?</span>
              )}
            </div>
            {!rewatchDateOpen ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={rewatchBusy}
                  className="rounded-full font-bold border-primary/40 text-primary hover:bg-primary/10"
                  onClick={() => logRewatch()}
                >
                  <Repeat className="h-3.5 w-3.5 mr-1.5" />
                  Log rewatch
                </Button>
                <button
                  className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                  onClick={() => { setRewatchDate(new Date().toISOString().slice(0, 10)); setRewatchDateOpen(true); }}
                >
                  another date?
                </button>
                {lastLoggedEventId && (
                  <button
                    className="text-xs text-muted-foreground hover:text-destructive underline underline-offset-2"
                    disabled={rewatchBusy}
                    onClick={undoRewatch}
                  >
                    undo
                  </button>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={rewatchDate}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={e => setRewatchDate(e.target.value)}
                  className="h-8 rounded-full border border-border bg-background px-3 text-xs font-semibold"
                />
                <Button
                  size="sm"
                  disabled={rewatchBusy || !rewatchDate}
                  className="rounded-full font-bold"
                  onClick={() => logRewatch(rewatchDate)}
                >
                  Log
                </Button>
                <button
                  className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                  onClick={() => setRewatchDateOpen(false)}
                >
                  cancel
                </button>
              </div>
            )}
          </section>
        )}

        {/* Ratings */}
        <section className="bg-muted p-8 rounded-[2.5rem] border border-border">
          {(() => {
            // Once a title has enough community votes, show the Cinephilers
            // aggregate in place of the TMDB rating. One star only — a 5-star
            // strip misreads as a /5 scale when every score here is /10.
            // Layout: score + star, count directly below, Rate button beside.
            const useCine = cineRating?.hasEnough && cineRating.average !== null;
            const score = useCine ? cineRating!.average! : movie.rating;
            const count = useCine ? cineRating!.count : movie.votes;
            return (
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-3 min-w-0">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">{useCine ? 'Cinephilers Rating' : 'TMDB Rating'}</h3>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-5xl font-black font-headline text-foreground">{score.toFixed(1)}</span>
                      <Star className="h-7 w-7 fill-yellow-400 text-yellow-400" />
                    </div>
                    <div className="text-xs text-muted-foreground font-bold mt-1.5">{count.toLocaleString()} ratings</div>
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => { if (!authUser) { setAuthGate('rate movies'); return; } setRateSheetOpen(true); }}
                  className="rounded-full border-border font-bold shrink-0"
                >
                  <Star className={`h-4 w-4 mr-2 ${userRating > 0 ? 'fill-yellow-400 text-yellow-400' : ''}`} />
                  {userRating > 0 ? `Your rating: ${userRating}/10` : 'Rate this'}
                </Button>
              </div>
            );
          })()}
        </section>

        {movie && (
          <RatingSheet
            open={rateSheetOpen}
            onClose={() => setRateSheetOpen(false)}
            title={movie.title}
            poster={movie.poster}
            currentRating={userRating}
            showWatchlistOption={isInWatchlist}
            onRate={async (score, removeWl) => {
              applyRating(score);
              if (removeWl) {
                try {
                  await removeFromWatchlistServerFirst();
                  toast({ title: 'Removed from Watchlist' });
                } catch {
                  toast({ title: "Rated, but couldn't remove from Watchlist. Try again from the list.", variant: 'destructive' });
                }
              }
            }}
            onRemoveRating={removeRatingServerFirst}
          />
        )}

        {/* Friends' ratings */}
        <FriendsRatings tmdbId={id} />

        {/* Trailers */}
        {movie.trailers && movie.trailers.length > 0 && (
          <TrailersSection trailers={movie.trailers} />
        )}

        {/* Cast & Crew */}
        {(movie.cast.length > 0 || (movie.crew && movie.crew.length > 0)) && (
          <section className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-headline font-bold">Cast & Crew</h3>
              <Link
                href={`/movie/${movie.id}/cast`}
                className="text-xs text-primary border border-primary/30 rounded-full px-3 py-1 hover:bg-primary/10 transition-colors font-semibold"
              >
                See All
              </Link>
            </div>
            <div className="bg-muted rounded-3xl p-6 border border-border space-y-6">
              {/* Cast */}
              {movie.cast.length > 0 && (
                <ScrollArea className="w-full">
                  <div className="flex gap-5 pb-4">
                    {movie.cast.slice(0, 12).map(actor => <PersonCard key={actor.id} actor={actor} />)}
                  </div>
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>
              )}
              {/* Key crew */}
              {movie.crew && movie.crew.length > 0 && (
                <>
                  {movie.cast.length > 0 && <Separator className="bg-muted" />}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {movie.director && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-primary mb-1">Director</p>
                        <p className="text-sm font-bold font-headline">{movie.director}</p>
                      </div>
                    )}
                    {movie.crew.filter(c => c.job !== 'Director').slice(0, 5).map(c => (
                      <div key={`${c.name}-${c.job}`}>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">{c.job}</p>
                        <p className="text-sm font-bold font-headline">{c.name}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {movie.director && (!movie.crew || movie.crew.length === 0) && (
                <>
                  {movie.cast.length > 0 && <Separator className="bg-muted" />}
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-primary mb-1">Director</p>
                    <p className="text-xl font-bold font-headline">{movie.director}</p>
                  </div>
                </>
              )}
            </div>
          </section>
        )}

        {/* Collection (franchise) */}
        {movie.collection && movie.collection.parts.length > 1 && (
          <CollectionSection collection={movie.collection} movieId={movie.id} />
        )}

        {/* Images */}
        {movie.images && <ImagesGallery images={movie.images} movieId={movie.id} />}

        {/* Release Info */}
        <ReleaseInfo movie={movie} />

        {/* Seasons & Episodes (TV only) */}
        {movie.type === 'show' && movie.seasons && movie.seasons.length > 0 && (
          <SeasonsSection
            seasons={movie.seasons}
            showTmdbId={showTmdbId}
            watchedEpisodes={watchedEpisodes}
            onToggleEpisodeWatched={toggleEpisodeWatched}
            onEpisodeClick={(ep, seasonNumber) => router.push(`/movie/${movie.id}-S${seasonNumber}E${ep.episode_number}`)}
          />
        )}

        {/* Reviews */}
        <ReviewsSection movie={movie} writeOpen={writeReviewOpen} setWriteOpen={setWriteReviewOpen} myReview={myReview} setMyReview={setMyReview} currentRating={userRating} onRate={applyRating} />

        {/* Quotes (kept for any future data) */}
        {movie.quotes.length > 0 && (
          <section className="space-y-6">
            <h3 className="text-2xl font-headline font-bold flex items-center gap-3">
              <Quote className="h-6 w-6 text-primary" /> Iconic Quotes
            </h3>
            <div className="space-y-4">
              {movie.quotes.map((q, i) => (
                <div key={i} className="p-6 bg-muted rounded-3xl border-l-4 border-primary italic text-base text-gray-300 shadow-lg">{q}</div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Lightbox */}
      {lightboxImg && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxImg(null)}
        >
          <div className="relative max-w-5xl w-full aspect-video rounded-2xl overflow-hidden">
            <Image src={lightboxImg} alt="" fill className="object-contain" />
          </div>
        </div>
      )}

      <AuthGateModal
        open={authGate !== null}
        onClose={() => setAuthGate(null)}
        action={authGate ?? undefined}
      />
    </main>
  );
}
