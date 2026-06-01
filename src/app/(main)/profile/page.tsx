
"use client"

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Movie } from '@/lib/types';
import { readUserStats, computeAllBadges, getComingSoonBadges, ensureSignupDate, ComputedBadge, ComingSoonBadge } from '@/lib/badges';
import { BadgeCard, FeaturedSeasonalBadge, ComingSoonCard, TierGuide } from '@/components/badge-card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { MovieCard } from '@/components/movie-card';
import Link from 'next/link';
import { Settings, Star, Film, List, MessageSquare, ChevronRight, Award, History, Bookmark, User, Eye, Plus } from 'lucide-react';
import { FavoritesSection } from '@/components/favorites-section';
import { BarChart, Bar, XAxis, ResponsiveContainer, Cell, YAxis, Tooltip as ChartTooltip } from 'recharts';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';

interface RatedItem { id: string; title: string; poster: string; year: string; tmdbRating?: number; userRating: number; }

type LucideIcon = React.ComponentType<{ className?: string }>;

const SectionHeader = ({
  title,
  icon: Icon,
  seeAllContent,
}: {
  title: string;
  icon: LucideIcon;
  seeAllContent?: React.ReactNode;
}) => (
  <div className="flex items-center justify-between mb-6">
    <h3 className="text-2xl font-headline font-bold flex items-center gap-3">
      <Icon className="h-6 w-6 text-primary" /> {title}
    </h3>
    {seeAllContent}
  </div>
);

function WatchlistRow({ movie }: { movie: Movie }) {
  const [userRating, setUserRating] = React.useState<number | undefined>();
  const [watched, setWatched] = React.useState(false);

  React.useEffect(() => {
    try {
      if (localStorage.getItem(`watched-${movie.id}`) === 'true') setWatched(true);
      const r = localStorage.getItem(`movie-rating-${movie.id}`);
      if (r) setUserRating(Number(r));
    } catch { /* ignore */ }
  }, [movie.id]);

  return (
    <Link href={`/movie/${movie.id}`} className="group flex items-center gap-4 py-3.5 border-b border-border last:border-0">
      <div className="w-16 aspect-[2/3] rounded-lg overflow-hidden bg-muted shadow-sm shrink-0">
        <img src={movie.poster} alt={movie.title} className="w-full h-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold font-headline line-clamp-2 group-hover:text-primary transition-colors leading-snug mb-0.5">
          {movie.title}
        </h3>
        <p className="text-xs text-muted-foreground mb-1.5">{movie.year}</p>
        <div className="flex items-center gap-2.5 flex-wrap">
          {movie.rating > 0 && (
            <div className="flex items-center gap-0.5">
              <span className="text-xs text-yellow-400 font-bold">★</span>
              <span className="text-xs font-bold text-foreground">{movie.rating.toFixed(1)}</span>
            </div>
          )}
          {userRating !== undefined && (
            <div className="flex items-center gap-0.5">
              <span className="text-xs text-blue-400 font-bold">★</span>
              <span className="text-xs font-bold text-blue-400">{userRating}</span>
            </div>
          )}
          {watched && (
            <div className="flex items-center gap-1 text-blue-400">
              <Eye className="h-3.5 w-3.5" />
              <span className="text-xs font-semibold">Watched</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

const MovieListDialog = ({ title, movies }: { title: string; movies: Movie[] }) => (
  <Dialog>
    <DialogTrigger asChild>
      <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary transition-colors">
        See All <ChevronRight className="h-4 w-4 ml-1" />
      </Button>
    </DialogTrigger>
    <DialogContent className="max-w-lg rounded-3xl h-[80vh] flex flex-col p-0 bg-background border-border">
      <DialogHeader className="px-6 pt-6 pb-3 border-b border-border shrink-0">
        <DialogTitle className="font-headline text-2xl font-bold">{title}</DialogTitle>
      </DialogHeader>
      <ScrollArea className="flex-1 px-6 pb-6">
        <div className="pt-2">
          {movies.map(movie => <WatchlistRow key={movie.id} movie={movie} />)}
        </div>
      </ScrollArea>
    </DialogContent>
  </Dialog>
);

const EmptyRow = ({ message }: { message: string }) => (
  <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
    {message}
  </div>
);

interface RecentItem { id: string; title: string; poster: string; year: string; loggedAt: string; rating?: number; tmdbRating?: number; }
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
  const [viewList, setViewList] = useState<UserList | null>(null);

  useEffect(() => { setLists(loadLists()); }, []);

  const createList = () => {
    if (!newTitle.trim()) return;
    const nl: UserList = { id: Date.now().toString(), title: newTitle.trim(), isPrivate: newPrivate, createdAt: new Date().toISOString(), items: [] };
    const updated = [...lists, nl];
    saveLists(updated);
    setLists(updated);
    setCreateOpen(false);
    setNewTitle('');
    setNewPrivate(false);
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
            <button
              key={l.id}
              onClick={() => setViewList(l)}
              className="w-full flex items-center gap-4 p-4 rounded-2xl border border-border hover:bg-muted/40 transition-colors text-left"
            >
              {/* Mini poster strip */}
              <div className="flex gap-1 shrink-0">
                {l.items.slice(0, 3).map(item => (
                  <div key={item.movieId} className="w-10 aspect-[2/3] rounded-lg overflow-hidden bg-muted">
                    <img src={item.poster} alt={item.title} className="w-full h-full object-cover" />
                  </div>
                ))}
                {l.items.length === 0 && (
                  <div className="w-10 aspect-[2/3] rounded-lg bg-muted flex items-center justify-center">
                    <Film className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold font-headline truncate">{l.title}</p>
                <p className="text-xs text-muted-foreground">{l.items.length} {l.items.length === 1 ? 'title' : 'titles'} · {l.isPrivate ? 'Private' : 'Public'}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
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

      {/* View list dialog */}
      <Dialog open={!!viewList} onOpenChange={v => !v && setViewList(null)}>
        <DialogContent className="max-w-lg rounded-3xl h-[80vh] flex flex-col p-0 bg-background border-border">
          <DialogHeader className="px-6 pt-6 pb-3 border-b border-border shrink-0">
            <DialogTitle className="font-headline text-2xl font-bold flex items-center justify-between">
              {viewList?.title}
              <span className="text-xs font-normal text-muted-foreground border border-border rounded-full px-2 py-0.5">{viewList?.isPrivate ? 'Private' : 'Public'}</span>
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1 px-6 pb-6">
            {viewList?.items.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">No movies added yet</p>
            ) : (
              <div className="pt-2">
                {viewList?.items.map(item => (
                  <Link key={item.movieId} href={`/movie/${item.movieId}`} className="group flex items-center gap-4 py-3.5 border-b border-border last:border-0">
                    <div className="w-16 aspect-[2/3] rounded-lg overflow-hidden bg-muted shadow-sm shrink-0">
                      <img src={item.poster} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold font-headline line-clamp-2 group-hover:text-primary transition-colors">{item.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{item.year}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </section>
  );
}


type SettingsView = 'main' | 'edit-profile' | 'privacy';

export default function ProfilePage() {
  const { user: authUser, logout, refetch, updateUserLocally } = useAuth();
  const [showSettings, setShowSettings] = useState(false);
  const [settingsView, setSettingsView] = useState<SettingsView>('main');
  const [editForm, setEditForm] = useState({ displayName: '', bio: '', avatarUrl: '' });
  const [saving, setSaving] = useState(false);
  const [localIsPrivate, setLocalIsPrivate] = useState(authUser?.isPrivate ?? false);

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
  const [comingSoon, setComingSoon] = useState<ComingSoonBadge[]>([]);
  const [showBadgesDialog, setShowBadgesDialog] = useState(false);
  const [recentWatched, setRecentWatched] = useState<RecentItem[]>([]);
  const [watchedCount, setWatchedCount] = useState(0);
  const [watchlist, setWatchlist] = useState<Movie[]>([]);
  const [userReviews, setUserReviews] = useState<UserReview[]>([]);
  const [ratedItems, setRatedItems] = useState<RatedItem[]>([]);
  const [ratingFilter, setRatingFilter] = useState<number | null>(null);

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

  useEffect(() => {
    ensureSignupDate();
    setBadges(computeAllBadges(readUserStats()));
    setComingSoon(getComingSoonBadges());

    // Count total watched titles
    try {
      const allWatchedIds = new Set<string>();
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)!;
        if (k.startsWith('watched-') && !k.startsWith('watched-ep-') && localStorage.getItem(k) === 'true')
          allWatchedIds.add(k.slice('watched-'.length));
        if (k.startsWith('watched-ep-')) {
          const m = k.slice('watched-ep-'.length).match(/^(.+)-S\d+E\d+$/);
          if (m) allWatchedIds.add(m[1]);
        }
      }
      setWatchedCount(allWatchedIds.size);
    } catch { /* ignore */ }

    // Build recent watch preview from all watched-* keys
    const buildWatchHistory = async () => {
      try {
        // Fallback lookup from recently-viewed
        const rvMap = new Map<string, { title: string; poster: string; year: string; type: string; tmdbRating?: number }>();
        try {
          const stored = localStorage.getItem('recently-viewed');
          if (stored) {
            const rv = JSON.parse(stored) as { id: string; title: string; poster: string; year: string; type: string; rating?: number }[];
            for (const item of rv) rvMap.set(item.id, { title: item.title, poster: item.poster, year: item.year, type: item.type, tmdbRating: item.rating });
          }
        } catch { /* ignore */ }

        // Collect all watched IDs
        const allWatchedIds = new Set<string>();
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i)!;
          if (k.startsWith('watched-') && !k.startsWith('watched-ep-') && localStorage.getItem(k) === 'true')
            allWatchedIds.add(k.slice('watched-'.length));
          if (k.startsWith('watched-ep-')) {
            const m = k.slice('watched-ep-'.length).match(/^(.+)-S\d+E\d+$/);
            if (m) allWatchedIds.add(m[1]);
          }
        }

        const items: RecentItem[] = [];
        const fetchPromises: Promise<void>[] = [];

        for (const id of allWatchedIds) {
          const raw = localStorage.getItem(`meta-${id}`);
          const meta = raw ? JSON.parse(raw) : null;
          const rv = rvMap.get(id);

          if (!meta && !rv) {
            // Fetch from API and cache
            fetchPromises.push(
              fetch(`/api/movies/${id}`)
                .then(r => r.json())
                .then((data: { title?: string; poster?: string; year?: string; type?: string; rating?: number; error?: string }) => {
                  if (data.error || !data.title) return;
                  const cached = { title: data.title, poster: data.poster ?? '', year: data.year ?? '', type: data.type ?? 'movie', tmdbRating: data.rating };
                  try { localStorage.setItem(`meta-${id}`, JSON.stringify(cached)); } catch { /* ignore */ }
                  const rating = localStorage.getItem(`movie-rating-${id}`);
                  items.push({ id, title: cached.title, poster: cached.poster, year: cached.year, loggedAt: '', rating: rating ? Number(rating) : undefined, tmdbRating: cached.tmdbRating });
                })
                .catch(() => { /* ignore */ })
            );
            continue;
          }

          const rating = localStorage.getItem(`movie-rating-${id}`);
          items.push({
            id,
            title: meta?.title ?? rv?.title ?? '',
            poster: meta?.poster ?? rv?.poster ?? '',
            year: meta?.year ?? rv?.year ?? '',
            loggedAt: '',
            rating: rating ? Number(rating) : undefined,
            tmdbRating: typeof meta?.tmdbRating === 'number' ? meta.tmdbRating : rv?.tmdbRating,
          });
        }

        // Wait for any API fetches, then update state
        if (fetchPromises.length > 0) {
          await Promise.allSettled(fetchPromises);
        }
        setRecentWatched(items.slice(0, 50));
      } catch { /* ignore */ }
    };
    buildWatchHistory();

    // Build watchlist from watchlist-* keys
    try {
      const wlItems: Movie[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)!;
        if (!k.startsWith('watchlist-')) continue;
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        let meta: Record<string, unknown>;
        try { meta = JSON.parse(raw); } catch { continue; }
        if (!meta.title) continue;
        wlItems.push({
          id: k.slice('watchlist-'.length),
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
      setWatchlist(wlItems);
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
        if (!title || !poster) continue;
        rated.push({ id, title, poster, year: meta?.year ?? rv?.year ?? '', tmdbRating: meta?.tmdbRating ?? rv?.tmdbRating, userRating });
      }
      setRatedItems(rated);
    } catch { /* ignore */ }
  }, []);

  const ratingData = [1,2,3,4,5,6,7,8,9,10].map(n => ({
    rating: String(n),
    count: ratedItems.filter(r => r.userRating === n).length,
  }));
  const maxRatingCount = Math.max(...ratingData.map(d => d.count), 1);
  const yDomainMax = Math.ceil(maxRatingCount / 0.65);

  const activeSeasonal = badges.filter(b => b.isSeasonal && b.isSeasonActive);
  const otherBadges = badges.filter(b => !(b.isSeasonal && b.isSeasonActive));

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
        <Button variant="outline" size="icon" className="rounded-full border-white/10 bg-white/5 hover:bg-white/10" onClick={openSettings}>
          <Settings className="h-5 w-5" />
        </Button>

        <Dialog open={showSettings} onOpenChange={v => { setShowSettings(v); if (!v) setSettingsView('main'); }}>
          <DialogContent className="sm:max-w-md rounded-3xl">
            {/* ── Main settings view ── */}
            {settingsView === 'main' && (
              <>
                <DialogHeader>
                  <DialogTitle className="font-headline">Settings</DialogTitle>
                </DialogHeader>
                <div className="space-y-6 py-4">
                  <div className="space-y-2">
                    <h4 className="text-sm font-bold">Account</h4>
                    <Button variant="ghost" className="w-full justify-start text-sm h-12 rounded-xl" onClick={() => setSettingsView('edit-profile')}>
                      Edit Profile <ChevronRight className="h-4 w-4 ml-auto" />
                    </Button>
                    <Button variant="ghost" className="w-full justify-start text-sm h-12 rounded-xl" onClick={() => setSettingsView('privacy')}>
                      Privacy Settings <ChevronRight className="h-4 w-4 ml-auto" />
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-sm font-bold">App</h4>
                    <Button variant="ghost" className="w-full justify-start text-sm h-12 rounded-xl" onClick={() => toast({ title: 'Notifications coming soon' })}>
                      Notification Preferences <ChevronRight className="h-4 w-4 ml-auto" />
                    </Button>
                    <Button variant="ghost" className="w-full justify-start text-sm h-12 rounded-xl" onClick={() => toast({ title: 'Email us at support@cinephilers.app' })}>
                      Help & Support <ChevronRight className="h-4 w-4 ml-auto" />
                    </Button>
                  </div>
                  <Separator className="bg-white/5" />
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
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-4">
        <div>
          <h1 className="text-4xl font-headline font-bold">
            {authUser?.displayName ?? authUser?.username ?? 'Your Profile'}
          </h1>
          <p className="text-muted-foreground text-lg">@{authUser?.username ?? 'username'}</p>
        </div>
        <p className="text-lg text-gray-400 leading-relaxed max-w-md">
          {authUser?.bio ?? 'Set up your profile to track movies and connect with friends.'}
        </p>
        <div className="flex gap-10 pt-4">
          <div className="flex flex-col">
            <span className="text-2xl font-bold font-headline">{authUser?.followingCount ?? 0}</span>
            <span className="text-xs text-muted-foreground uppercase tracking-widest font-bold">Following</span>
          </div>
          <div className="flex flex-col">
            <span className="text-2xl font-bold font-headline">{authUser?.followersCount ?? 0}</span>
            <span className="text-xs text-muted-foreground uppercase tracking-widest font-bold">Followers</span>
          </div>
        </div>
      </div>

      <Separator className="bg-white/5" />

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
          <Link href="/history">
            <Button variant="ghost" size="sm" className="text-primary hover:opacity-80 transition-opacity font-semibold">
              See All <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </Link>
        </div>
        <p className="text-sm text-muted-foreground mb-5">Everything you&apos;ve watched, rated, or checked into</p>
        {recentWatched.length > 0 ? (
          <div className="flex overflow-x-auto gap-4 pb-4 no-scrollbar -mx-6 px-6">
            {recentWatched.map(item => (
              <Link key={item.id} href={`/movie/${item.id}`} className="group shrink-0 w-36">
                <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-muted shadow-lg movie-card-hover mb-2">
                  <img src={item.poster} alt={item.title} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
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
              </Link>
            ))}
          </div>
        ) : (
          <EmptyRow message="Movies and shows you watch will appear here" />
        )}
      </section>

      {/* Ratings */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-2xl font-headline font-bold flex items-center gap-3">
            <Star className="h-6 w-6 text-primary" />
            Ratings
            {ratedItems.length > 0 && <span className="text-2xl font-bold text-foreground">{ratedItems.length}</span>}
          </h3>
          {ratedItems.length > 0 && (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-primary hover:opacity-80 font-semibold">
                  See All <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg rounded-3xl h-[80vh] flex flex-col p-0 bg-background border-border">
                <DialogHeader className="px-6 pt-6 pb-3 border-b border-border shrink-0">
                  <DialogTitle className="font-headline text-2xl font-bold">Ratings ({ratedItems.length})</DialogTitle>
                </DialogHeader>
                <ScrollArea className="flex-1 px-6 pb-6">
                  <div className="pt-2">
                    {ratedItems.map(item => (
                      <Link key={item.id} href={`/movie/${item.id}`} className="group flex items-center gap-4 py-3.5 border-b border-border last:border-0">
                        <div className="w-16 aspect-[2/3] rounded-lg overflow-hidden bg-muted shadow-sm shrink-0">
                          <img src={item.poster} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold font-headline line-clamp-2 group-hover:text-primary transition-colors leading-snug mb-0.5">{item.title}</p>
                          <p className="text-xs text-muted-foreground mb-1.5">{item.year}</p>
                          <div className="flex items-center gap-2.5">
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
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </ScrollArea>
              </DialogContent>
            </Dialog>
          )}
        </div>
        {ratedItems.length > 0 ? (
          <div className="flex overflow-x-auto gap-4 pb-4 no-scrollbar -mx-6 px-6">
            {ratedItems.slice(0, 50).map(item => (
              <Link key={item.id} href={`/movie/${item.id}`} className="group shrink-0 w-36">
                <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-muted shadow-lg movie-card-hover mb-2">
                  <img src={item.poster} alt={item.title} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
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
            <BarChart data={ratingData} onClick={d => { if (d?.activePayload?.[0]) { const r = parseInt(d.activePayload[0].payload.rating); if (ratedItems.filter(i => i.userRating === r).length > 0) setRatingFilter(r); } }}>
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

      {/* Rating filter dialog */}
      <Dialog open={ratingFilter !== null} onOpenChange={v => !v && setRatingFilter(null)}>
        <DialogContent className="max-w-lg rounded-3xl h-[80vh] flex flex-col p-0 bg-background border-border">
          <DialogHeader className="px-6 pt-6 pb-3 border-b border-border shrink-0">
            <DialogTitle className="font-headline text-2xl font-bold flex items-center gap-2">
              <span className="text-blue-400">★</span> Rated {ratingFilter}/10
              <span className="text-sm font-normal text-muted-foreground ml-1">
                ({ratedItems.filter(i => i.userRating === ratingFilter).length} titles)
              </span>
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1 px-6 pb-6">
            <div className="pt-2">
              {ratedItems.filter(i => i.userRating === ratingFilter).map(item => (
                <Link key={item.id} href={`/movie/${item.id}`} className="group flex items-center gap-4 py-3.5 border-b border-border last:border-0">
                  <div className="w-16 aspect-[2/3] rounded-lg overflow-hidden bg-muted shadow-sm shrink-0">
                    <img src={item.poster} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold font-headline line-clamp-2 group-hover:text-primary transition-colors leading-snug mb-0.5">{item.title}</p>
                    <p className="text-xs text-muted-foreground mb-1.5">{item.year}</p>
                    <div className="flex items-center gap-2.5">
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
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Watchlist */}
      <section>
        <SectionHeader
          title="Watchlist"
          icon={Bookmark}
          seeAllContent={watchlist.length > 0 ? <MovieListDialog title="Watchlist" movies={watchlist} /> : undefined}
        />
        {watchlist.length > 0 ? (
          <div className="flex overflow-x-auto gap-4 pb-4 no-scrollbar">
            {watchlist.map(m => <MovieCard key={m.id} movie={m} horizontal />)}
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
          seeAllContent={userReviews.length > 0 ? (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary transition-colors">
                  See All <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg rounded-3xl h-[80vh] flex flex-col p-0 bg-background border-border">
                <DialogHeader className="px-6 pt-6 pb-3 border-b border-border shrink-0">
                  <DialogTitle className="font-headline text-2xl font-bold">Your Reviews</DialogTitle>
                </DialogHeader>
                <ScrollArea className="flex-1 px-6 pb-6">
                  <div className="space-y-3 pt-3">
                    {userReviews.map(r => (
                      <Link key={r.movieId} href={`/movie/${r.movieId}`} className="group flex gap-4 p-4 rounded-2xl border border-border hover:bg-muted/40 transition-colors">
                        <div className="w-14 shrink-0 aspect-[2/3] rounded-lg overflow-hidden bg-muted">
                          <img src={r.moviePoster} alt={r.movieTitle} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                        </div>
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-bold font-headline line-clamp-1 group-hover:text-primary transition-colors">{r.movieTitle}</p>
                            {r.rating > 0 && (
                              <div className="flex items-center gap-0.5 shrink-0 text-yellow-500 text-xs font-black">
                                <Star className="h-3 w-3 fill-current" /> {r.rating}
                              </div>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground">{r.movieYear} · {r.date}</p>
                          <p className="text-xs text-foreground/80 italic line-clamp-2 leading-relaxed">&ldquo;{r.content}&rdquo;</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </ScrollArea>
              </DialogContent>
            </Dialog>
          ) : undefined}
        />
        {userReviews.length > 0 ? (
          <div className="space-y-4">
            {userReviews.slice(0, 3).map(r => (
              <Link key={r.movieId} href={`/movie/${r.movieId}`} className="group flex gap-4 p-4 rounded-2xl border border-border hover:bg-muted/40 transition-colors">
                <div className="w-14 shrink-0 aspect-[2/3] rounded-lg overflow-hidden bg-muted">
                  <img src={r.moviePoster} alt={r.movieTitle} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-bold font-headline line-clamp-1 group-hover:text-primary transition-colors">{r.movieTitle}</p>
                    {r.rating > 0 && (
                      <div className="flex items-center gap-0.5 shrink-0 text-yellow-500 text-xs font-black">
                        <Star className="h-3 w-3 fill-current" /> {r.rating}
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground">{r.movieYear} · {r.date}</p>
                  <p className="text-xs text-foreground/80 italic line-clamp-2 leading-relaxed">&ldquo;{r.content}&rdquo;</p>
                </div>
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
            <button
              onClick={() => setShowBadgesDialog(true)}
              className="text-xs text-primary border border-primary/30 rounded-full px-3 py-1 hover:bg-primary/10 transition-colors font-semibold flex items-center gap-1"
            >
              See All <ChevronRight className="h-3 w-3" />
            </button>
          ) : undefined}
        />

        {/* Tier guide */}
        <TierGuide />

        {/* Active seasonal badges — full-width featured cards */}
        {activeSeasonal.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Seasonal</p>
            {activeSeasonal.map(badge => (
              <FeaturedSeasonalBadge key={badge.id} badge={badge} />
            ))}
          </div>
        )}

        {/* All-time badges — 3-column grid */}
        {otherBadges.slice(0, 3).length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">All Time</p>
              {otherBadges.length > 3 && (
                <button
                  onClick={() => setShowBadgesDialog(true)}
                  className="text-xs text-primary border border-primary/30 rounded-full px-3 py-1 hover:bg-primary/10 transition-colors font-semibold flex items-center gap-1"
                >
                  See All <ChevronRight className="h-3 w-3" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {otherBadges.slice(0, 3).map(badge => (
                <BadgeCard key={badge.id} badge={badge} />
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Badges See All dialog */}
      <Dialog open={showBadgesDialog} onOpenChange={setShowBadgesDialog}>
        <DialogContent className="max-w-lg rounded-3xl h-[80vh] flex flex-col p-0 bg-background border-border">
          <DialogHeader className="px-6 pt-6 pb-3 border-b border-border shrink-0">
            <DialogTitle className="font-headline text-2xl font-bold">Badges & Achievements</DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1 px-6 pb-6">
            <div className="pt-4 space-y-6">
              {/* All-time badges */}
              {badges.filter(b => !b.isSeasonal).length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">All Time</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {badges.filter(b => !b.isSeasonal).map(badge => (
                      <BadgeCard key={badge.id} badge={badge} />
                    ))}
                  </div>
                </div>
              )}
              {/* Seasonal badges */}
              {badges.filter(b => b.isSeasonal).length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Seasonal</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {badges.filter(b => b.isSeasonal).map(badge => (
                      <BadgeCard key={badge.id} badge={badge} />
                    ))}
                  </div>
                </div>
              )}
              {/* Coming Soon */}
              {comingSoon.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Coming Soon</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {comingSoon.map(b => <ComingSoonCard key={b.id} badge={b} />)}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </main>
  );
}
