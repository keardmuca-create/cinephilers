
"use client"

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Movie } from '@/lib/types';
import { readUserStats, computeAllBadges, ensureSignupDate, ComputedBadge } from '@/lib/badges';
import { normalizeLocalMediaIds, getAddedAt, getWatchedAtISO, getManualWatchISO } from '@/lib/media-id';
import { BadgeCard, FeaturedSeasonalBadge, FounderFlairChip } from '@/components/badge-card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Settings, Star, Film, List, MessageSquare, ChevronRight, Award, History, Bookmark, User, Eye, Plus, Heart, TrendingUp, Download, Trash2, Share2, Repeat } from 'lucide-react';
import { ImportDialog } from '@/components/import-dialog';
import { FavoritesSection } from '@/components/favorites-section';
import { BarChart, Bar, XAxis, ResponsiveContainer, Cell, YAxis, Tooltip as ChartTooltip } from 'recharts';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { toast } from '@/hooks/use-toast';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { batchFetchMeta } from '@/lib/meta-batch';
import { useAuth } from '@/contexts/auth-context';
import { readSavedRefine, applyRefineSort } from '@/lib/refine-sort';
import type { RefineValue } from '@/components/refine-sheet';

interface RatedItem { id: string; title: string; poster: string; year: string; tmdbRating?: number; userRating: number; }

interface DiaryShelfItem { id: string; count: number; lastWatchedAt: string | null; title: string; poster: string; year: string; tmdbRating?: number; userRating?: number }

// Rewatched shelf — films watched 2+ times, one card per title with the same
// rating row as Watch History (TMDB score, your rating, eye) plus an xN badge.
// Server-only data (never mirrored to localStorage).
function DiarySection() {
  const { user } = useAuth();
  const [items, setItems] = useState<DiaryShelfItem[] | null>(null);

  useEffect(() => {
    if (!user?.username) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchWithAuth(`/api/users/${user.username}/rewatched?min=2&sort=recent&limit=20`);
        if (!res.ok) { if (!cancelled) setItems([]); return; }
        const json = await res.json();
        const rows: { tmdbId: string; count: number; lastWatchedAt: string | null }[] = json.data?.items ?? [];
        if (rows.length === 0) { if (!cancelled) setItems([]); return; }
        const meta = await batchFetchMeta(rows.map(r => r.tmdbId));
        if (cancelled) return;
        setItems(rows.map(r => {
          let userRating: number | undefined;
          try {
            const saved = localStorage.getItem(`movie-rating-${r.tmdbId}`);
            if (saved) userRating = parseInt(saved, 10);
          } catch { /* ignore */ }
          return {
            id: r.tmdbId,
            count: r.count,
            lastWatchedAt: r.lastWatchedAt,
            title: meta[r.tmdbId]?.title ?? 'Untitled',
            poster: meta[r.tmdbId]?.poster ?? '',
            year: meta[r.tmdbId]?.year ?? '',
            tmdbRating: meta[r.tmdbId]?.tmdbRating,
            userRating,
          };
        }));
      } catch { if (!cancelled) setItems([]); }
    })();
    return () => { cancelled = true; };
  }, [user?.username]);

  // Always render the section (like the others), with an empty state when the
  // user has no rewatches yet — don't hide it.
  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-1 h-6 bg-primary rounded-full" />
          <h3 className="text-2xl font-headline font-bold flex items-center gap-2">
            <Repeat className="h-6 w-6 text-primary" />
            Rewatched
          </h3>
        </div>
        {items && items.length > 0 && (
          <Link href="/diary" className="text-xs text-primary border border-primary/30 rounded-full px-3 py-1 hover:bg-primary/10 transition-colors font-semibold flex items-center gap-1">
            See All <ChevronRight className="h-3 w-3" />
          </Link>
        )}
      </div>
      <p className="text-sm text-muted-foreground mb-5">Films you&apos;ve watched more than once</p>
      {!items || items.length === 0 ? (
        <EmptyRow message="Films you watch more than once will show up here" />
      ) : (
      <div className="flex overflow-x-auto gap-4 pb-4 no-scrollbar -mx-6 px-6">
        {items.map(item => (
          <Link key={item.id} href={`/movie/${item.id}`} className="group shrink-0 w-36">
            <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-muted shadow-lg movie-card-hover mb-2">
              {item.poster ? (
                <img src={item.poster} alt={item.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-muted">
                  <Film className="h-9 w-9 text-primary/60" />
                </div>
              )}
              {item.count > 1 && (
                <div className="absolute top-1.5 right-1.5 flex items-center gap-1 bg-background/85 backdrop-blur-sm rounded-full px-2 py-0.5">
                  <Repeat className="h-3 w-3 text-primary" />
                  <span className="text-xs font-black text-foreground">&times;{item.count}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
              {item.tmdbRating !== undefined && (
                <div className="flex items-center gap-0.5">
                  <span className="text-xs text-yellow-400 font-bold">★</span>
                  <span className="text-xs font-bold text-foreground">{item.tmdbRating.toFixed(1)}</span>
                </div>
              )}
              {item.userRating !== undefined && (
                <div className="flex items-center gap-0.5">
                  <span className="text-xs text-blue-400 font-bold">★</span>
                  <span className="text-xs font-bold text-blue-400">{item.userRating}</span>
                </div>
              )}
              <Eye className="h-3.5 w-3.5 text-blue-400" />
            </div>
            <p className="text-xs font-semibold font-headline line-clamp-2 group-hover:text-primary transition-colors leading-snug">
              {item.title} {item.year ? `(${item.year})` : ''}
            </p>
          </Link>
        ))}
      </div>
      )}
    </section>
  );
}

type LucideIcon = React.ComponentType<{ className?: string }>;

const SectionHeader = ({
  title,
  icon: Icon,
  seeAllContent,
  count,
}: {
  title: string;
  icon: LucideIcon;
  seeAllContent?: React.ReactNode;
  count?: number;
}) => (
  <div className="flex items-center justify-between mb-6">
    <h3 className="text-2xl font-headline font-bold flex items-center gap-3">
      <Icon className="h-6 w-6 text-primary" /> {title}
      {count !== undefined && count > 0 && (
        <span className="text-2xl font-bold text-foreground">{count}</span>
      )}
    </h3>
    {seeAllContent}
  </div>
);

const EmptyRow = ({ message }: { message: string }) => (
  <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
    {message}
  </div>
);

interface RecentItem { id: string; title: string; poster: string; year: string; loggedAt: string; rating?: number; tmdbRating?: number; linkId?: string; isEpisode?: boolean; seasonNumber?: number; episodeNumber?: number; showName?: string; }
interface UserReview { movieId: string; movieTitle: string; moviePoster: string; movieYear: string; content: string; rating: number; date: string; }
interface UserList { id: string; title: string; isPrivate: boolean; createdAt: string; items: { movieId: string; title: string; poster: string; year: string; type: string }[]; }

function loadLists(): UserList[] {
  try { return JSON.parse(localStorage.getItem('user-lists') ?? '[]'); } catch { return []; }
}
function saveLists(ls: UserList[]) {
  try { localStorage.setItem('user-lists', JSON.stringify(ls)); } catch { /* ignore */ }
}

function ListsSection() {
  const [lists, setLists] = useState<UserList[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPrivate, setNewPrivate] = useState(false);
  // Saved list refine, so each card's 3-poster strip matches the order the user set
  // on the list pages. Read after mount and re-read on return.
  const [listRefine, setListRefine] = useState<RefineValue | null>(null);
  useEffect(() => {
    const read = () => setListRefine(readSavedRefine('list-refine'));
    read();
    const onVisible = () => { if (document.visibilityState === 'visible') read(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', read);
    // Login sync restores account-saved refines into localStorage AFTER this
    // mounts — re-read then, or the saved sort doesn't apply until a refresh.
    window.addEventListener('cinephilers-db-restored', read);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', read);
      window.removeEventListener('cinephilers-db-restored', read);
    };
  }, []);

  useEffect(() => {
    setLists(loadLists());
    // Sync from DB in background
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
    // Re-read lists whenever DB restore lands new cross-device data
    const onDbRestored = () => setLists(loadLists());
    window.addEventListener('cinephilers-db-restored', onDbRestored);
    return () => window.removeEventListener('cinephilers-db-restored', onDbRestored);
  }, []);

  const createList = async () => {
    if (!newTitle.trim()) return;
    setCreateOpen(false);
    const optimistic: UserList = { id: Date.now().toString(), title: newTitle.trim(), isPrivate: newPrivate, createdAt: new Date().toISOString(), items: [] };
    const updated = [...lists, optimistic];
    saveLists(updated);
    setLists(updated);
    setNewTitle('');
    setNewPrivate(false);
    // Persist to DB and update ID with the real UUID
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
          setLists(prev => {
            const next = prev.map(l => l.id === optimistic.id ? { ...l, id: realId } : l);
            saveLists(next);
            return next;
          });
        }
      }
    } catch { /* ignore */ }
  };

  return (
    <section className="space-y-4">
      <SectionHeader
        title="Lists"
        icon={List}
        seeAllContent={
          <button
            onClick={() => setCreateOpen(true)}
            className="text-xs text-primary border border-primary/30 rounded-full px-3 py-1 hover:bg-primary/10 transition-colors font-semibold flex items-center gap-1"
          >
            <Plus className="h-3 w-3" /> Create
          </button>
        }
      />

      {lists.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
          <p className="text-sm text-muted-foreground">Create lists to organise your movies</p>
          <Button variant="outline" className="rounded-full px-6" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Create a List
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {lists.map(l => (
            <Link
              key={l.id}
              href={`/lists/${l.id}`}
              className="flex items-center gap-4 p-4 rounded-2xl border border-border hover:bg-muted/40 transition-colors text-left"
            >
              {/* Mini poster strip — ordered by the saved list refine */}
              <div className="flex gap-1 shrink-0">
                {applyRefineSort(l.items.map(it => ({ ...it, id: it.movieId })), listRefine).slice(0, 3).map(item => (
                  <div key={item.movieId} className="w-10 aspect-[2/3] rounded-lg overflow-hidden bg-muted flex items-center justify-center">
                    {item.poster ? (
                      <img src={item.poster} alt={item.title} className="w-full h-full object-cover" />
                    ) : (
                      <Film className="h-4 w-4 text-primary/60" />
                    )}
                  </div>
                ))}
                {l.items.length === 0 && (
                  <div className="w-10 aspect-[2/3] rounded-lg bg-muted flex items-center justify-center">
                    <Film className="h-4 w-4 text-primary/60" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold font-headline truncate">{l.title}</p>
                <p className="text-xs text-muted-foreground">{l.items.length} {l.items.length === 1 ? 'title' : 'titles'} · {l.isPrivate ? 'Private' : 'Public'}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </Link>
          ))}
        </div>
      )}

      {/* Create list dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="rounded-3xl max-w-sm border-border">
          <DialogHeader><DialogTitle className="font-headline">Create New List</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <input
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="List title…"
              autoFocus
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
              <Button className="flex-1 rounded-xl" disabled={!newTitle.trim()} onClick={createList}>Create</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </section>
  );
}


type SettingsView = 'main' | 'edit-profile' | 'privacy' | 'account';

function Pulse({ className }: { className: string }) {
  return <div className={`bg-muted animate-pulse rounded-lg ${className}`} />;
}

function SkeletonCard() {
  return (
    <div className="shrink-0 w-36 space-y-2">
      <div className="aspect-[2/3] rounded-xl bg-muted animate-pulse" />
      <Pulse className="h-3 w-3/4" />
      <Pulse className="h-3 w-1/2" />
    </div>
  );
}

function FollowStatLink({ username, type, count }: { username: string; type: 'following' | 'followers'; count: number }) {
  const label = type === 'following' ? 'Following' : 'Followers';
  return (
    <Link href={`/profile/${username}/${type}`} className="flex flex-col items-start hover:opacity-70 transition-opacity">
      <span className="text-2xl font-bold font-headline">{count}</span>
      <span className="text-xs text-muted-foreground uppercase tracking-widest font-bold">{label}</span>
    </Link>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const { user: authUser, loading: authLoading, logout, refetch, updateUserLocally } = useAuth();
  const [showSettings, setShowSettings] = useState(false);
  const [settingsView, setSettingsView] = useState<SettingsView>('main');
  const [editForm, setEditForm] = useState({ displayName: '', bio: '', avatarUrl: '' });
  const [saving, setSaving] = useState(false);
  const [localIsPrivate, setLocalIsPrivate] = useState(authUser?.isPrivate ?? false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [showImport, setShowImport] = useState(false);

  // Captured before hooks — rendered after all hooks to respect Rules of Hooks
  const guestView = !authLoading && !authUser ? (
      <main className="p-6 pt-12 pb-32 max-w-2xl mx-auto space-y-12">
        {/* Sign-up banner */}
        <div className="bg-primary/10 border border-primary/20 rounded-2xl p-5 flex flex-col gap-3">
          <div className="space-y-1">
            <p className="font-bold text-base">Create your Cinephilers profile</p>
            <p className="text-sm text-muted-foreground">Track every movie you watch, rate them, write reviews, and earn badges.</p>
          </div>
          <div className="flex gap-2">
            <Button asChild size="sm" className="rounded-xl font-bold">
              <Link href="/signup">Sign Up</Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="rounded-xl font-bold">
              <Link href="/login">Log In</Link>
            </Button>
          </div>
        </div>

        {/* Header */}
        <div className="flex justify-between items-start">
          <div className="h-24 w-24 rounded-full bg-muted animate-pulse border-4 border-border" />
        </div>
        <div className="space-y-3">
          <Pulse className="h-9 w-44" />
          <Pulse className="h-4 w-28" />
          <Pulse className="h-4 w-64" />
          <div className="flex gap-10 pt-2">
            {[1,2].map(i => (
              <div key={i} className="flex flex-col gap-1">
                <Pulse className="h-7 w-8" />
                <Pulse className="h-3 w-16" />
              </div>
            ))}
          </div>
        </div>

        <Separator className="bg-border" />

        {/* Favorites — 10 slots */}
        <section>
          <h3 className="text-2xl font-headline font-bold flex items-center gap-3 mb-6">
            <Heart className="h-6 w-6 text-primary" /> Favorites
          </h3>
          <div className="grid grid-cols-5 gap-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="aspect-[2/3] rounded-xl border-2 border-dashed border-foreground/15 flex items-center justify-center">
                <Plus className="h-4 w-4 text-foreground/20" />
              </div>
            ))}
          </div>
        </section>

        <Separator className="bg-border" />

        {/* Watch History */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-2xl font-headline font-bold flex items-center gap-2">
              <History className="h-6 w-6 text-primary" /> Watch History
            </h3>
            <Pulse className="h-6 w-16 rounded-full" />
          </div>
          <Pulse className="h-4 w-56 mb-5" />
          <div className="flex gap-4 overflow-hidden">
            {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        </section>

        <Separator className="bg-border" />

        {/* Ratings */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl font-headline font-bold flex items-center gap-3">
              <Star className="h-6 w-6 text-primary" /> Ratings
            </h3>
            <Pulse className="h-6 w-16 rounded-full" />
          </div>
          <div className="flex gap-4 overflow-hidden">
            {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        </section>

        <Separator className="bg-border" />

        {/* Rating Distribution chart */}
        <section className="space-y-4">
          <h3 className="text-2xl font-headline font-bold flex items-center gap-3">
            <Star className="h-6 w-6 text-primary" /> Rating Distribution
          </h3>
          <div className="h-56 w-full bg-muted/40 rounded-3xl p-6 border border-border flex items-end justify-between gap-1">
            {[3,5,7,6,8,10,9,6,4,2].map((h, i) => (
              <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1">
                <div className="w-full rounded-t-md bg-muted animate-pulse" style={{ height: `${h * 10}%` }} />
                <span className="text-[10px] text-muted-foreground font-bold">{i + 1}</span>
              </div>
            ))}
          </div>
        </section>

        <Separator className="bg-border" />

        {/* Watchlist */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl font-headline font-bold flex items-center gap-3">
              <Bookmark className="h-6 w-6 text-primary" /> Watchlist
            </h3>
            <Pulse className="h-6 w-16 rounded-full" />
          </div>
          <div className="flex gap-4 overflow-hidden">
            {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        </section>

        <Separator className="bg-border" />

        {/* Reviews */}
        <section>
          <h3 className="text-2xl font-headline font-bold flex items-center gap-3 mb-6">
            <MessageSquare className="h-6 w-6 text-primary" /> Reviews
          </h3>
          <div className="space-y-4">
            {[1,2,3].map(i => (
              <div key={i} className="flex gap-4 p-4 rounded-2xl border border-border">
                <div className="w-14 shrink-0 aspect-[2/3] rounded-lg bg-muted animate-pulse" />
                <div className="flex-1 space-y-2 pt-1">
                  <Pulse className="h-4 w-3/4" />
                  <Pulse className="h-3 w-1/4" />
                  <Pulse className="h-3 w-full" />
                  <Pulse className="h-3 w-5/6" />
                </div>
              </div>
            ))}
          </div>
        </section>

        <Separator className="bg-border" />

        {/* Badges */}
        <section>
          <h3 className="text-2xl font-headline font-bold flex items-center gap-3 mb-6">
            <Award className="h-6 w-6 text-primary" /> Badges
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {[1,2,3,4,5,6].map(i => (
              <div key={i} className="aspect-square rounded-2xl border border-dashed border-foreground/15 bg-muted/20 flex flex-col items-center justify-center gap-2">
                <Award className="h-8 w-8 text-foreground/15" />
                <Pulse className="h-2 w-12" />
              </div>
            ))}
          </div>
        </section>
      </main>
  ) : null;

  // Keep local privacy toggle in sync when authUser loads
  useEffect(() => { setLocalIsPrivate(authUser?.isPrivate ?? false); }, [authUser?.isPrivate]);

  const avatarInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new window.Image();
      img.onload = () => {
        const size = 400;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d')!;
        const min = Math.min(img.width, img.height);
        const sx = (img.width - min) / 2;
        const sy = (img.height - min) / 2;
        ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
        updateUserLocally({ avatarUrl: dataUrl });
        fetch('/api/users/me', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ avatarUrl: dataUrl }),
        }).catch(() => {});
        toast({ title: 'Profile photo updated' });
      };
      img.src = e.target!.result as string;
    };
    reader.readAsDataURL(file);
  }, [updateUserLocally]);

  const [badges, setBadges] = useState<ComputedBadge[]>([]);
  const [recentWatched, setRecentWatched] = useState<RecentItem[]>([]);
  const [watchedCount, setWatchedCount] = useState(0);
  const [watchlist, setWatchlist] = useState<Movie[]>([]);
  const [userReviews, setUserReviews] = useState<UserReview[]>([]);
  const [ratedItems, setRatedItems] = useState<RatedItem[]>([]);

  // Saved refines from the full-page lists, so each preview shows the same order
  // the user chose there. Read after mount (localStorage would mismatch SSR) and
  // re-read on focus/return so a refine set on another page reflects here.
  const [refines, setRefines] = useState<{ history: RefineValue | null; ratings: RefineValue | null; watchlist: RefineValue | null }>(
    { history: null, ratings: null, watchlist: null }
  );
  useEffect(() => {
    const read = () => setRefines({
      history:   readSavedRefine('history-refine'),
      ratings:   readSavedRefine('ratings-refine'),
      watchlist: readSavedRefine('watchlist-refine'),
    });
    read();
    const onVisible = () => { if (document.visibilityState === 'visible') read(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', read);
    // Login sync restores account-saved refines into localStorage AFTER this
    // mounts — re-read then, or the saved sorts don't apply until a refresh.
    window.addEventListener('cinephilers-db-restored', read);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', read);
      window.removeEventListener('cinephilers-db-restored', read);
    };
  }, []);

  // Preview lists reordered to match each full page's saved refine (sort only).
  const sortedWatched   = React.useMemo(() => applyRefineSort(recentWatched, refines.history),   [recentWatched, refines.history]);
  const sortedRated     = React.useMemo(() => applyRefineSort(ratedItems, refines.ratings),      [ratedItems, refines.ratings]);
  const sortedWatchlist = React.useMemo(() => applyRefineSort(watchlist, refines.watchlist),     [watchlist, refines.watchlist]);

  function openSettings() {
    setEditForm({
      displayName: authUser?.displayName ?? '',
      bio: authUser?.bio ?? '',
      avatarUrl: authUser?.avatarUrl ?? '',
    });
    setSettingsView('main');
    setShowSettings(true);
  }

  async function saveProfile() {
    setSaving(true);
    const patch = {
      displayName: editForm.displayName.trim() || null,
      bio: editForm.bio.trim() || null,
      avatarUrl: editForm.avatarUrl.trim() || null,
    };
    // Update locally first so the UI reflects changes immediately
    updateUserLocally(patch);
    setSettingsView('main');
    toast({ title: 'Profile updated' });
    try {
      await fetch('/api/users/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(patch),
      });
    } finally {
      setSaving(false);
    }
  }

  async function savePrivacy(newValue: boolean) {
    // Update toggle immediately — no waiting for the API
    setLocalIsPrivate(newValue);
    updateUserLocally({ isPrivate: newValue });
    toast({ title: newValue ? 'Account set to private' : 'Account set to public' });
    fetch('/api/users/me', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ isPrivate: newValue }),
    }).catch(() => { /* fire-and-forget */ });
  }

  async function deleteAccount() {
    setDeleting(true);
    try {
      const res = await fetch('/api/users/me', { method: 'DELETE', credentials: 'include' });
      if (!res.ok) { toast({ title: 'Something went wrong. Please try again.', variant: 'destructive' }); return; }
      // Clear all local data then redirect
      try {
        localStorage.clear();
      } catch { /* ignore */ }
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/login';
    } finally {
      setDeleting(false);
    }
  }

  const deleteReview = (movieId: string) => {
    if (!window.confirm('Delete this review? This cannot be undone.')) return;
    try { localStorage.removeItem(`review-${movieId}`); } catch { /* ignore */ }
    setUserReviews(prev => prev.filter(r => r.movieId !== movieId));
    const mediaType = movieId.startsWith('tmdb-tv-') ? 'SHOW' : 'MOVIE';
    fetchWithAuth(`/api/reviews?tmdbId=${encodeURIComponent(movieId)}&mediaType=${mediaType}`, { method: 'DELETE' }).catch(() => {});
    toast({ title: 'Review deleted' });
  };

  // PWA opens fire several rebuild triggers at once (focus + visibilitychange +
  // db-restored). buildWatchHistory is async, so overlapping runs finish out of
  // order and a stale early run (started before the sync wrote its data) can
  // overwrite the complete strip with a partial one. Only the latest run may
  // write its result.
  const historyRunRef = useRef(0);

  const loadFromStorage = useCallback(() => {
    normalizeLocalMediaIds();
    ensureSignupDate();
    setBadges(computeAllBadges(readUserStats()));

    // Count total watched titles
    try {
      const allWatchedIds = new Set<string>();
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)!;
        if (k.startsWith('watched-') && !k.startsWith('watched-ep-') && localStorage.getItem(k) === 'true')
          allWatchedIds.add(k.slice('watched-'.length));
        if (k.startsWith('watched-ep-'))
          allWatchedIds.add(k.slice('watched-ep-'.length));
      }
      setWatchedCount(allWatchedIds.size);
    } catch { /* ignore */ }

    // Build recent watch preview — movies as individual cards, episodes grouped by show
    const buildWatchHistory = async () => {
      const runId = ++historyRunRef.current;
      try {
        const rvMap = new Map<string, { title: string; poster: string; year: string; type: string; tmdbRating?: number }>();
        try {
          const stored = localStorage.getItem('recently-viewed');
          if (stored) {
            const rv = JSON.parse(stored) as { id: string; title: string; poster: string; year: string; type: string; rating?: number }[];
            for (const item of rv) rvMap.set(item.id, { title: item.title, poster: item.poster, year: item.year, type: item.type, tmdbRating: item.rating });
          }
        } catch { /* ignore */ }

        let watchLog: { id: string; loggedAt: string }[] = [];
        try { watchLog = JSON.parse(localStorage.getItem('watch-log') ?? '[]'); } catch { /* ignore */ }
        const logMap = new Map<string, string>();
        for (const entry of watchLog) logMap.set(entry.id, entry.loggedAt);

        // Separate movies/whole-shows from individual episodes
        const movieIds = new Set<string>();
        const episodeIds: string[] = [];

        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i)!;
          if (k.startsWith('watched-') && !k.startsWith('watched-ep-') && !k.startsWith('watched-show-eps-') && localStorage.getItem(k) === 'true') {
            movieIds.add(k.slice('watched-'.length));
          }
          if (k.startsWith('watched-ep-') && localStorage.getItem(k) === 'true') {
            const epId = k.slice('watched-ep-'.length); // e.g. tmdb-tv-12345-S1E5
            if (/-S\d+E\d+$/.test(epId)) episodeIds.push(epId);
          }
        }

        // Sort by date FIRST using local timestamps only (no network), then fetch
        // metadata for JUST the preview slice. Fetching the whole library (hundreds
        // of titles) to render a 50-item strip is what made this hang on a cold
        // open while the synchronous count showed instantly. The two-tier order
        // matches the history page: hand-marked titles first (newest), then the
        // rest by watch date.
        const PREVIEW = 50;
        type Cand = { id: string; isEpisode: boolean; loggedAt: string };
        const candidates: Cand[] = [];
        for (const id of movieIds) candidates.push({ id, isEpisode: false, loggedAt: logMap.get(id) ?? getWatchedAtISO(id) ?? new Date(0).toISOString() });
        for (const epId of episodeIds) candidates.push({ id: epId, isEpisode: true, loggedAt: logMap.get(epId) ?? getWatchedAtISO(epId) ?? new Date(0).toISOString() });

        candidates.sort((a, b) => {
          const am = getManualWatchISO(a.id);
          const bm = getManualWatchISO(b.id);
          if (am && !bm) return -1;
          if (!am && bm) return 1;
          if (am && bm) return new Date(bm).getTime() - new Date(am).getTime();
          return new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime();
        });

        const preview = candidates.slice(0, PREVIEW);
        const readMeta = (id: string): Record<string, unknown> | null => {
          try { const r = localStorage.getItem(`meta-${id}`); return r ? JSON.parse(r) : null; } catch { return null; }
        };
        // Fetch only the preview items missing from the meta cache — one small batch.
        const uncached = preview.map(c => c.id).filter(id => !readMeta(id));
        const fetched = uncached.length > 0 ? await batchFetchMeta(uncached) : {};
        const getMeta = (id: string): Record<string, unknown> | null => readMeta(id) ?? (fetched[id] as unknown as Record<string, unknown> | undefined) ?? null;

        const items: RecentItem[] = [];
        for (const c of preview) {
          const rv = rvMap.get(c.id);
          const data = getMeta(c.id);
          const title = (data?.title as string | undefined) ?? rv?.title;
          if (!title) continue;
          const rating = localStorage.getItem(`movie-rating-${c.id}`);
          if (c.isEpisode) {
            const m = c.id.match(/^(.+)-S(\d+)E(\d+)$/);
            items.push({
              id: c.id,
              linkId: m ? m[1] : c.id,
              title: title.replace(/^S\d+E\d+\s·\s/, ''),
              poster: (data?.poster as string) ?? '',
              year: (data?.year as string) ?? '',
              loggedAt: c.loggedAt,
              rating: rating ? Number(rating) : undefined,
              tmdbRating: typeof data?.tmdbRating === 'number' ? data.tmdbRating : undefined,
              isEpisode: true,
              seasonNumber: (data?.seasonNumber as number) ?? (m ? parseInt(m[2], 10) : undefined),
              episodeNumber: (data?.episodeNumber as number) ?? (m ? parseInt(m[3], 10) : undefined),
              showName: data?.showName as string | undefined,
            });
          } else {
            items.push({
              id: c.id,
              title,
              poster: (data?.poster as string) ?? rv?.poster ?? '',
              year: (data?.year as string) ?? rv?.year ?? '',
              loggedAt: c.loggedAt,
              rating: rating ? Number(rating) : undefined,
              tmdbRating: typeof data?.tmdbRating === 'number' ? data.tmdbRating : rv?.tmdbRating,
            });
          }
        }
        // preview was already date-sorted, so keep that order.
        // A newer rebuild started while this one was fetching — discard this result.
        if (runId !== historyRunRef.current) return;
        setRecentWatched(items);
      } catch { /* ignore */ }
    };
    buildWatchHistory();

    // Build watchlist from watchlist-* keys
    try {
      const wlItems: Movie[] = [];
      const wlMissing: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)!;
        if (!k.startsWith('watchlist-')) continue;
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        let meta: Record<string, unknown>;
        try { meta = JSON.parse(raw); } catch { continue; }
        const id = k.slice('watchlist-'.length);
        // Fold in the cached meta entry so fields the watchlist-* record doesn't
        // carry — notably tmdbRating — are present. The full watchlist page does
        // this too; without it the profile preview showed no rating while the
        // full page did. The watchlist-* entry still wins on any overlapping key.
        try {
          const cached = localStorage.getItem(`meta-${id}`);
          if (cached) meta = { ...JSON.parse(cached), ...meta };
        } catch { /* ignore */ }
        if (!meta.title) { wlMissing.push(id); continue; }
        wlItems.push({
          id,
          title: meta.title as string,
          poster: (meta.poster as string) ?? '',
          backdrop: (meta.backdrop as string) ?? '',
          year: (meta.year as string) ?? '',
          genre: (meta.genre as string) ?? '',
          rating: typeof meta.tmdbRating === 'number' ? meta.tmdbRating : 0,
          description: (meta.description as string) ?? '',
          type: (meta.type as 'movie' | 'show') ?? 'movie',
          followingsRating: 0,
          votes: 0,
          director: '',
          cast: [],
          reviews: [],
          quotes: [],
          trivia: [],
        } as Movie);
      }
      setWatchlist(wlItems.sort((a, b) => getAddedAt(b.id) - getAddedAt(a.id)));

      if (wlMissing.length > 0) {
        (async () => {
          const metaMap = await batchFetchMeta(wlMissing);
          const fetched: Movie[] = wlMissing.flatMap(id => {
            const m = metaMap[id];
            if (!m?.title) return [];
            try {
              localStorage.setItem(`watchlist-${id}`, JSON.stringify({ id, title: m.title, poster: m.poster ?? '', year: m.year ?? '', type: m.type ?? 'movie' }));
            } catch { /* ignore */ }
            return [{
              id, title: m.title, poster: m.poster ?? '', backdrop: '', year: m.year ?? '',
              genre: m.genre ?? '', rating: typeof m.tmdbRating === 'number' ? m.tmdbRating : 0,
              description: '', type: (m.type as 'movie' | 'show') ?? 'movie',
              followingsRating: 0, votes: 0, director: '', cast: [], reviews: [], quotes: [], trivia: [],
            } as Movie];
          });
          if (fetched.length > 0) {
            setWatchlist(prev => {
              const seen = new Set(prev.map(p => p.id));
              return [...prev, ...fetched.filter(f => !seen.has(f.id))]
                .sort((a, b) => getAddedAt(b.id) - getAddedAt(a.id));
            });
          }
        })();
      }
    } catch { /* ignore */ }

    // Load user-written reviews
    try {
      const reviews: UserReview[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)!;
        if (!k.startsWith('review-')) continue;
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        try { reviews.push(JSON.parse(raw)); } catch { /* ignore */ }
      }
      setUserReviews(reviews.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));

      const reviewsMissing = reviews.filter(r => !r.movieTitle || !r.moviePoster);
      if (reviewsMissing.length > 0) {
        (async () => {
          const metaMap = await batchFetchMeta(reviewsMissing.map(r => r.movieId));
          const patched: UserReview[] = reviewsMissing.flatMap(r => {
            const m = metaMap[r.movieId];
            if (!m?.title) return [];
            const updated = { ...r, movieTitle: m.title, moviePoster: m.poster ?? '', movieYear: m.year ?? '' };
            try { localStorage.setItem(`review-${r.movieId}`, JSON.stringify(updated)); } catch { /* ignore */ }
            return [updated];
          });
          if (patched.length > 0) {
            setUserReviews(prev => prev.map(p => patched.find(f => f.movieId === p.movieId) ?? p));
          }
        })();
      }
    } catch { /* ignore */ }

    // Load rated items
    try {
      const rvMap = new Map<string, { title: string; poster: string; year: string; tmdbRating?: number }>();
      try {
        const stored = localStorage.getItem('recently-viewed');
        if (stored) {
          const rv = JSON.parse(stored) as { id: string; title: string; poster: string; year: string; rating?: number }[];
          for (const item of rv) rvMap.set(item.id, { title: item.title, poster: item.poster, year: item.year, tmdbRating: item.rating });
        }
      } catch { /* ignore */ }

      const rated: RatedItem[] = [];
      const ratedMissing: { id: string; userRating: number }[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)!;
        if (!k.startsWith('movie-rating-')) continue;
        const userRating = Number(localStorage.getItem(k));
        if (!userRating) continue;
        const id = k.slice('movie-rating-'.length);
        const raw = localStorage.getItem(`meta-${id}`);
        const meta = raw ? JSON.parse(raw) : null;
        const rv = rvMap.get(id);
        const title = meta?.title ?? rv?.title;
        const poster = meta?.poster ?? rv?.poster;
        if (!title || !poster) { ratedMissing.push({ id, userRating }); continue; }
        rated.push({ id, title, poster, year: meta?.year ?? rv?.year ?? '', tmdbRating: meta?.tmdbRating ?? rv?.tmdbRating, userRating });
      }
      setRatedItems(rated.sort((a, b) => getAddedAt(b.id) - getAddedAt(a.id)));

      if (ratedMissing.length > 0) {
        (async () => {
          const metaMap = await batchFetchMeta(ratedMissing.map(r => r.id));
          const fetched: RatedItem[] = ratedMissing.flatMap(({ id, userRating }) => {
            const m = metaMap[id];
            if (!m?.title) return [];
            return [{ id, title: m.title, poster: m.poster ?? '', year: m.year ?? '', tmdbRating: typeof m.tmdbRating === 'number' ? m.tmdbRating : undefined, userRating }];
          });
          if (fetched.length > 0) {
            setRatedItems(prev => {
              const seen = new Set(prev.map(p => p.id));
              return [...prev, ...fetched.filter(f => !seen.has(f.id))]
                .sort((a, b) => getAddedAt(b.id) - getAddedAt(a.id));
            });
          }
        })();
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadFromStorage(); }, [loadFromStorage]);

  const recomputeStats = useCallback(() => {
    ensureSignupDate();
    setBadges(computeAllBadges(readUserStats()));
  }, []);

  // Refresh follower/following counts from DB on mount
  useEffect(() => { refetch(); }, [refetch]);

  // Re-run stats AND watch history when DB restore finishes (new cross-device data
  // just landed), when a title is marked watched in-app, and when the page becomes
  // visible again — Next's router cache can serve this page without remounting, so a
  // freshly-marked title wouldn't otherwise reach the top of the strip.
  useEffect(() => {
    const handler = () => {
      recomputeStats();
      loadFromStorage();
    };
    const onVisible = () => { if (document.visibilityState === 'visible') handler(); };
    window.addEventListener('cinephilers-db-restored', handler);
    window.addEventListener('cinephilers-watched-changed', handler);
    window.addEventListener('focus', handler);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('cinephilers-db-restored', handler);
      window.removeEventListener('cinephilers-watched-changed', handler);
      window.removeEventListener('focus', handler);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [recomputeStats, loadFromStorage]);

  const ratingData = [1,2,3,4,5,6,7,8,9,10].map(n => ({
    rating: String(n),
    count: ratedItems.filter(r => r.userRating === n).length,
  }));
  const maxRatingCount = Math.max(...ratingData.map(d => d.count), 1);
  const yDomainMax = Math.ceil(maxRatingCount / 0.65);

  const activeSeasonal = badges.filter(b => b.isSeasonal && b.isSeasonActive);
  const founderBadge = badges.find(b => b.isSpecial);
  // Founder is promoted to its own featured card, so keep it out of the carousel.
  const otherBadges = badges.filter(b => !(b.isSeasonal && b.isSeasonActive) && !b.isSpecial);

  const shareProfile = async () => {
    const username = authUser?.username;
    if (!username) return;
    const url = `${window.location.origin}/profile/${username}`;
    // Prefer the native share sheet on mobile; fall back to copying the link.
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Cinephilers', text: `Follow @${username} on Cinephilers`, url });
        return;
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return; // user dismissed the sheet
        // otherwise fall through to copying
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: 'Profile link copied!' });
    } catch {
      toast({ title: 'Could not copy link', variant: 'destructive' });
    }
  };

  if (guestView) return guestView;

  return (
    <main className="p-6 pt-12 pb-32 max-w-2xl mx-auto space-y-16">
      {/* Header */}
      <div className="flex justify-between items-start">
        {/* Avatar + change photo link */}
        <div className="flex flex-col items-center gap-2">
          <button onClick={() => avatarInputRef.current?.click()} className="rounded-full focus:outline-none">
            <Avatar className="h-32 w-32 ring-4 ring-primary/20 ring-offset-4 ring-offset-background shadow-2xl">
              {authUser?.avatarUrl && <AvatarImage src={authUser.avatarUrl} alt={authUser.username ?? 'avatar'} />}
              <AvatarFallback className="bg-primary/20">
                <User className="h-14 w-14 text-primary" />
              </AvatarFallback>
            </Avatar>
          </button>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleAvatarFile(f); e.target.value = ''; }}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="rounded-full border-border bg-muted hover:bg-muted/80" onClick={shareProfile} aria-label="Share profile">
            <Share2 className="h-5 w-5" />
          </Button>
          <Button variant="outline" size="icon" className="rounded-full border-border bg-muted hover:bg-muted/80" asChild>
            <Link href="/stats"><TrendingUp className="h-5 w-5" /></Link>
          </Button>
          <Button variant="outline" size="icon" className="rounded-full border-border bg-muted hover:bg-muted/80" onClick={openSettings}>
            <Settings className="h-5 w-5" />
          </Button>
        </div>

        {showImport && <ImportDialog onClose={() => setShowImport(false)} />}

        <Dialog open={showSettings} onOpenChange={v => { setShowSettings(v); if (!v) setSettingsView('main'); }}>
          <DialogContent className="sm:max-w-md rounded-3xl max-h-[85vh] flex flex-col">
            {/* ── Main settings view ── */}
            {settingsView === 'main' && (
              <>
                <DialogHeader>
                  <DialogTitle className="font-headline">Settings</DialogTitle>
                </DialogHeader>
                <div className="space-y-6 py-4 overflow-y-auto flex-1 pr-1">
                  <div className="space-y-2">
                    <h4 className="text-sm font-bold">Account</h4>
                    <Button variant="ghost" className="w-full justify-start text-sm h-12 rounded-xl" onClick={() => setSettingsView('edit-profile')}>
                      Edit Profile <ChevronRight className="h-4 w-4 ml-auto" />
                    </Button>
                    <Button variant="ghost" className="w-full justify-start text-sm h-12 rounded-xl" onClick={() => setSettingsView('privacy')}>
                      Privacy Settings <ChevronRight className="h-4 w-4 ml-auto" />
                    </Button>
                    <Button variant="ghost" className="w-full justify-start text-sm h-12 rounded-xl" onClick={() => { setDeleteConfirmText(''); setSettingsView('account'); }}>
                      Manage Account <ChevronRight className="h-4 w-4 ml-auto" />
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-sm font-bold">App</h4>
                    <Button variant="ghost" className="w-full justify-start text-sm h-12 rounded-xl" onClick={() => toast({ title: 'Notifications coming soon' })}>
                      Notification Preferences <ChevronRight className="h-4 w-4 ml-auto" />
                    </Button>
                    <Button variant="ghost" className="w-full justify-start text-sm h-12 rounded-xl" asChild>
                      <Link href="/support" onClick={() => setShowSettings(false)}>
                        Help & Support <ChevronRight className="h-4 w-4 ml-auto" />
                      </Link>
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-sm font-bold">Data</h4>
                    <Button variant="ghost" className="w-full justify-start text-sm h-12 rounded-xl" onClick={() => { setShowSettings(false); setShowImport(true); }}>
                      <Download className="h-4 w-4 mr-2 text-muted-foreground" />
                      Import from Letterboxd / IMDb <ChevronRight className="h-4 w-4 ml-auto" />
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-sm font-bold">About</h4>
                    <Button variant="ghost" className="w-full justify-start text-sm h-12 rounded-xl" asChild>
                      <Link href="/about" onClick={() => setShowSettings(false)}>
                        About Cinephilers <ChevronRight className="h-4 w-4 ml-auto" />
                      </Link>
                    </Button>
                    <Button variant="ghost" className="w-full justify-start text-sm h-12 rounded-xl" asChild>
                      <Link href="/privacy" onClick={() => setShowSettings(false)}>
                        Privacy Policy <ChevronRight className="h-4 w-4 ml-auto" />
                      </Link>
                    </Button>
                    <Button variant="ghost" className="w-full justify-start text-sm h-12 rounded-xl" asChild>
                      <Link href="/terms" onClick={() => setShowSettings(false)}>
                        Terms of Service <ChevronRight className="h-4 w-4 ml-auto" />
                      </Link>
                    </Button>
                  </div>
                  <Separator className="bg-muted" />
                  <Button variant="destructive" className="w-full rounded-xl h-12" onClick={logout}>Logout</Button>
                </div>
              </>
            )}

            {/* ── Edit Profile view ── */}
            {settingsView === 'edit-profile' && (
              <>
                <DialogHeader>
                  <div className="flex items-center gap-3">
                    <button onClick={() => setSettingsView('main')} className="text-muted-foreground hover:text-foreground transition-colors">
                      ←
                    </button>
                    <DialogTitle className="font-headline">Edit Profile</DialogTitle>
                  </div>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Display Name</label>
                    <input
                      value={editForm.displayName}
                      onChange={e => setEditForm(f => ({ ...f, displayName: e.target.value }))}
                      placeholder={authUser?.username ?? 'Your name'}
                      maxLength={50}
                      className="w-full px-4 py-3 rounded-xl border border-border bg-muted/30 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Bio</label>
                    <textarea
                      value={editForm.bio}
                      onChange={e => setEditForm(f => ({ ...f, bio: e.target.value }))}
                      placeholder="Tell people about your taste in films…"
                      maxLength={300}
                      rows={3}
                      className="w-full px-4 py-3 rounded-xl border border-border bg-muted/30 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                    />
                    <p className="text-xs text-muted-foreground text-right">{editForm.bio.length}/300</p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Avatar URL</label>
                    <input
                      value={editForm.avatarUrl}
                      onChange={e => setEditForm(f => ({ ...f, avatarUrl: e.target.value }))}
                      placeholder="https://…"
                      className="w-full px-4 py-3 rounded-xl border border-border bg-muted/30 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                  <div className="flex gap-3 pt-2">
                    <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setSettingsView('main')}>Cancel</Button>
                    <Button className="flex-1 rounded-xl" disabled={saving} onClick={saveProfile}>
                      {saving ? 'Saving…' : 'Save'}
                    </Button>
                  </div>
                </div>
              </>
            )}

            {/* ── Privacy Settings view ── */}
            {settingsView === 'privacy' && (
              <>
                <DialogHeader>
                  <div className="flex items-center gap-3">
                    <button onClick={() => setSettingsView('main')} className="text-muted-foreground hover:text-foreground transition-colors">
                      ←
                    </button>
                    <DialogTitle className="font-headline">Privacy Settings</DialogTitle>
                  </div>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <button
                    onClick={() => savePrivacy(!localIsPrivate)}
                    className={`w-full flex items-center justify-between px-4 py-4 rounded-xl border transition-colors ${localIsPrivate ? 'border-primary/40 bg-primary/5' : 'border-border bg-muted/30'}`}
                  >
                    <div className="text-left">
                      <p className="text-sm font-semibold">Private account</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Only approved followers can see your activity</p>
                    </div>
                    <div className={`w-11 h-6 rounded-full transition-colors flex items-center px-0.5 ml-4 shrink-0 ${localIsPrivate ? 'bg-primary' : 'bg-foreground/20'}`}>
                      <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${localIsPrivate ? 'translate-x-5' : 'translate-x-0'}`} />
                    </div>
                  </button>
                  <p className="text-xs text-muted-foreground px-1">
                    When your account is public, anyone can follow you and see your ratings, reviews, and lists.
                  </p>
                </div>
              </>
            )}

            {settingsView === 'account' && (
              <>
                <DialogHeader>
                  <div className="flex items-center gap-3">
                    <button onClick={() => setSettingsView('main')} className="text-muted-foreground hover:text-foreground transition-colors">
                      ←
                    </button>
                    <DialogTitle className="font-headline">Manage Account</DialogTitle>
                  </div>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Danger Zone</p>
                  <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 space-y-4">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-red-400">Delete account — permanent and cannot be undone.</p>
                      <p className="text-xs text-muted-foreground">All your ratings, reviews, watchlist, watch history, favorites, and account data will be permanently deleted.</p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">Type <span className="font-bold text-foreground">DELETE</span> to confirm</p>
                      <input
                        type="text"
                        value={deleteConfirmText}
                        onChange={e => setDeleteConfirmText(e.target.value)}
                        placeholder="Type DELETE here"
                        className="w-full px-4 py-3 rounded-xl bg-muted border border-border text-sm focus:outline-none focus:ring-2 focus:ring-red-500/50"
                      />
                    </div>
                    <Button
                      variant="destructive"
                      className="w-full rounded-xl h-12"
                      disabled={deleteConfirmText !== 'DELETE' || deleting}
                      onClick={deleteAccount}
                    >
                      {deleting ? 'Deleting…' : 'Permanently Delete My Account'}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-4">
        <div>
          <h1 className="text-4xl font-headline font-bold">
            {authUser?.displayName ?? authUser?.username ?? 'Your Profile'}
          </h1>
          <p className="text-muted-foreground text-lg">@{authUser?.username ?? 'username'}</p>
          {founderBadge && (
            <div className="mt-2">
              <FounderFlairChip badge={founderBadge} />
            </div>
          )}
        </div>
        <p className="text-lg text-foreground/70 leading-relaxed max-w-md">
          {authUser?.bio ?? 'Set up your profile to track movies and connect with friends.'}
        </p>
        <div className="flex gap-10 pt-4">
          <FollowStatLink username={authUser?.username ?? ''} type="following" count={authUser?.followingCount ?? 0} />
          <FollowStatLink username={authUser?.username ?? ''} type="followers" count={authUser?.followersCount ?? 0} />
        </div>
      </div>

      <Separator className="bg-muted" />

      {/* Favorites */}
      <section>
        <FavoritesSection />
      </section>

      {/* Watch History */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-1 h-6 bg-primary rounded-full" />
            <h3 className="text-2xl font-headline font-bold flex items-center gap-2">
              <History className="h-6 w-6 text-primary" />
              Watch history
              {watchedCount > 0 && (
                <span className="text-2xl font-bold text-foreground">{watchedCount}</span>
              )}
            </h3>
          </div>
          <Link href="/history" className="text-xs text-primary border border-primary/30 rounded-full px-3 py-1 hover:bg-primary/10 transition-colors font-semibold flex items-center gap-1">
            See All <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
        <p className="text-sm text-muted-foreground mb-5">Everything you&apos;ve watched, rated, or checked into</p>
        {recentWatched.length > 0 ? (
          <div className="flex overflow-x-auto gap-4 pb-4 no-scrollbar -mx-6 px-6">
            {sortedWatched.map(item => (
              <Link key={item.id} href={`/movie/${item.linkId ?? item.id}`} className="group shrink-0 w-36">
                <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-muted shadow-lg movie-card-hover mb-2">
                  {item.poster ? (
                    <img src={item.poster} alt={item.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-muted">
                      <Film className="h-9 w-9 text-primary/60" />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                  {item.tmdbRating !== undefined && (
                    <div className="flex items-center gap-0.5">
                      <span className="text-xs text-yellow-400 font-bold">★</span>
                      <span className="text-xs font-bold text-foreground">{item.tmdbRating.toFixed(1)}</span>
                    </div>
                  )}
                  {item.rating !== undefined && (
                    <div className="flex items-center gap-0.5">
                      <span className="text-xs text-blue-400 font-bold">★</span>
                      <span className="text-xs font-bold text-blue-400">{item.rating}</span>
                    </div>
                  )}
                  <Eye className="h-3.5 w-3.5 text-blue-400" />
                </div>
                <p className="text-xs font-semibold font-headline line-clamp-2 group-hover:text-primary transition-colors leading-snug">
                  {item.title} {item.year ? `(${item.year})` : ''}
                </p>
                {item.isEpisode && item.seasonNumber !== undefined && item.episodeNumber !== undefined && (
                  <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                    S{item.seasonNumber}·E{item.episodeNumber}{item.showName ? ` · ${item.showName}` : ''}
                  </p>
                )}
              </Link>
            ))}
          </div>
        ) : (
          <EmptyRow message="Movies and shows you watch will appear here" />
        )}
      </section>

      {/* Diary — films watched 2+ times, with all their dates (rewatches only) */}
      <DiarySection />

      {/* Ratings */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-2xl font-headline font-bold flex items-center gap-3">
            <Star className="h-6 w-6 text-primary" />
            Ratings
            {ratedItems.length > 0 && <span className="text-2xl font-bold text-foreground">{ratedItems.length}</span>}
          </h3>
          {ratedItems.length > 0 && (
            <Link href="/ratings" className="text-xs text-primary border border-primary/30 rounded-full px-3 py-1 hover:bg-primary/10 transition-colors font-semibold flex items-center gap-1">
              See All <ChevronRight className="h-3 w-3" />
            </Link>
          )}
        </div>
        {ratedItems.length > 0 ? (
          <div className="flex overflow-x-auto gap-4 pb-4 no-scrollbar -mx-6 px-6">
            {sortedRated.slice(0, 50).map(item => (
              <Link key={item.id} href={`/movie/${item.id}`} className="group shrink-0 w-36">
                <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-muted shadow-lg movie-card-hover mb-2">
                  {item.poster ? (
                    <img src={item.poster} alt={item.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-muted">
                      <Film className="h-9 w-9 text-primary/60" />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                  {item.tmdbRating !== undefined && (
                    <div className="flex items-center gap-0.5">
                      <span className="text-xs text-yellow-400 font-bold">★</span>
                      <span className="text-xs font-bold text-foreground">{item.tmdbRating.toFixed(1)}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-0.5">
                    <span className="text-xs text-blue-400 font-bold">★</span>
                    <span className="text-xs font-bold text-blue-400">{item.userRating}</span>
                  </div>
                  <Eye className="h-3.5 w-3.5 text-blue-400" />
                </div>
                <p className="text-xs font-semibold font-headline line-clamp-2 group-hover:text-primary transition-colors leading-snug">
                  {item.title} {item.year ? `(${item.year})` : ''}
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyRow message="Rate movies and shows to see them here" />
        )}
      </section>

      {/* Rating Distribution */}
      <section className="space-y-4">
        <SectionHeader title="Rating Distribution" icon={Star} />
        <div className="h-56 w-full bg-muted/40 rounded-3xl p-6 border border-border">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={ratingData} onClick={d => { if (d?.activePayload?.[0]) { const r = parseInt(d.activePayload[0].payload.rating); if (ratedItems.filter(i => i.userRating === r).length > 0) router.push(`/ratings?rating=${r}`); } }}>
              <XAxis dataKey="rating" axisLine={false} tickLine={false} tick={{ fill: '#888', fontSize: 11, fontWeight: 'bold' }} />
              <YAxis hide domain={[0, yDomainMax]} />
              <ChartTooltip cursor={{ fill: 'rgba(0,0,0,0.05)' }} contentStyle={{ backgroundColor: '#fff', border: '1px solid #eee', borderRadius: '12px', color: '#111' }} />
              <Bar dataKey="count" radius={[6, 6, 0, 0]} style={{ cursor: 'pointer' }}>
                {ratingData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={parseInt(entry.rating) >= 7 ? 'hsl(var(--primary))' : 'hsl(var(--accent))'} opacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        {ratedItems.length === 0 && (
          <p className="text-center text-sm text-muted-foreground">Rate movies to build your chart</p>
        )}
        {ratedItems.length > 0 && (
          <p className="text-center text-xs text-muted-foreground">Tap a bar to see titles with that rating</p>
        )}
      </section>

      {/* Watchlist */}
      <section>
        <SectionHeader
          title="Watchlist"
          icon={Bookmark}
          count={watchlist.length}
          seeAllContent={watchlist.length > 0 ? (
            <Link href="/watchlist" className="text-xs text-primary border border-primary/30 rounded-full px-3 py-1 hover:bg-primary/10 transition-colors font-semibold flex items-center gap-1">
              See All <ChevronRight className="h-3 w-3" />
            </Link>
          ) : undefined}
        />
        {watchlist.length > 0 ? (
          <div className="flex overflow-x-auto gap-4 pb-4 no-scrollbar -mx-6 px-6">
            {sortedWatchlist.map(item => (
              <Link key={item.id} href={`/movie/${item.id}`} className="group shrink-0 w-36">
                <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-muted shadow-lg movie-card-hover mb-2">
                  {item.poster ? (
                    <img src={item.poster} alt={item.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-muted">
                      <Film className="h-9 w-9 text-primary/60" />
                    </div>
                  )}
                </div>
                {item.rating > 0 && (
                  <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                    <div className="flex items-center gap-0.5">
                      <span className="text-xs text-yellow-400 font-bold">★</span>
                      <span className="text-xs font-bold text-foreground">{item.rating.toFixed(1)}</span>
                    </div>
                  </div>
                )}
                <p className="text-xs font-semibold font-headline line-clamp-2 group-hover:text-primary transition-colors leading-snug">
                  {item.title} {item.year ? `(${item.year})` : ''}
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyRow message="Save movies to watch later" />
        )}
      </section>

      {/* Lists */}
      <ListsSection />

      {/* Reviews */}
      <section>
        <SectionHeader
          title="Reviews"
          icon={MessageSquare}
          count={userReviews.length}
          seeAllContent={userReviews.length > 0 ? (
            <Link
              href="/reviews"
              className="text-xs text-primary border border-primary/30 rounded-full px-3 py-1 hover:bg-primary/10 transition-colors font-semibold flex items-center gap-1"
            >
              See All <ChevronRight className="h-3 w-3" />
            </Link>
          ) : undefined}
        />
        {userReviews.length > 0 ? (
          <div className="space-y-4">
            {userReviews.slice(0, 3).map(r => (
              <Link key={r.movieId} href={`/movie/${r.movieId}`} className="group relative flex gap-4 p-4 rounded-2xl border border-border hover:bg-muted/40 transition-colors">
                <div className="w-14 shrink-0 aspect-[2/3] rounded-lg overflow-hidden bg-muted">
                  {r.moviePoster ? (
                    <img src={r.moviePoster} alt={r.movieTitle} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Film className="h-5 w-5 text-primary/60" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="text-base font-bold font-headline line-clamp-1 group-hover:text-primary transition-colors">{r.movieTitle}</p>
                  <p className="text-xs text-muted-foreground">{r.movieYear} · {r.date}</p>
                  {r.rating > 0 && (
                    <div className="flex items-center gap-1">
                      <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                      <span className="text-sm font-bold text-foreground">{r.rating}/10</span>
                    </div>
                  )}
                  <p className="text-sm text-muted-foreground italic line-clamp-3 leading-relaxed pt-0.5">&ldquo;{r.content}&rdquo;</p>
                </div>
                <button
                  onClick={e => { e.preventDefault(); e.stopPropagation(); deleteReview(r.movieId); }}
                  className="shrink-0 self-start opacity-0 group-hover:opacity-100 transition-opacity p-2 rounded-full hover:bg-red-500/20 text-muted-foreground hover:text-red-400"
                  aria-label={`Delete review for ${r.movieTitle}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyRow message="Your reviews will appear here" />
        )}
      </section>

      {/* Badges */}
      <section className="space-y-4">
        <SectionHeader
          title="Badges & Achievements"
          icon={Award}
          seeAllContent={badges.length > 0 ? (
            <Link
              href="/badges"
              className="text-xs text-primary border border-primary/30 rounded-full px-3 py-1 hover:bg-primary/10 transition-colors font-semibold flex items-center gap-1"
            >
              See All <ChevronRight className="h-3 w-3" />
            </Link>
          ) : undefined}
        />

        {/* Active seasonal badges — full-width featured cards */}
        {activeSeasonal.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Seasonal</p>
            {activeSeasonal.map(badge => (
              <FeaturedSeasonalBadge key={badge.id} badge={badge} />
            ))}
          </div>
        )}

        {/* All-time badges — horizontal scroll carousel (matches Ratings row) */}
        {otherBadges.slice(0, 5).length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">All Time</p>
              {otherBadges.length > 5 && (
                <Link
                  href="/badges"
                  className="text-xs text-primary border border-primary/30 rounded-full px-3 py-1 hover:bg-primary/10 transition-colors font-semibold flex items-center gap-1"
                >
                  See All <ChevronRight className="h-3 w-3" />
                </Link>
              )}
            </div>
            <div className="flex overflow-x-auto gap-4 pb-4 no-scrollbar -mx-6 px-6">
              {otherBadges.slice(0, 5).map(badge => (
                <div key={badge.id} className="shrink-0 w-44">
                  <BadgeCard badge={badge} />
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

    </main>
  );
}
