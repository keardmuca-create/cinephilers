
"use client"

import React, { useState, useEffect } from 'react';
import { Movie } from '@/lib/types';
import { readUserStats, computeAllBadges, getComingSoonBadges, ensureSignupDate, ComputedBadge, ComingSoonBadge } from '@/lib/badges';
import { BadgeCard, ComingSoonCard, TierGuide } from '@/components/badge-card';
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

const RATING_DATA = [
  { rating: '1', count: 0 }, { rating: '2', count: 0 }, { rating: '3', count: 0 },
  { rating: '4', count: 0 }, { rating: '5', count: 0 }, { rating: '6', count: 0 },
  { rating: '7', count: 0 }, { rating: '8', count: 0 }, { rating: '9', count: 0 },
  { rating: '10', count: 0 },
];

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


export default function ProfilePage() {
  const [showSettings, setShowSettings] = useState(false);
  const [badges, setBadges] = useState<ComputedBadge[]>([]);
  const [comingSoon, setComingSoon] = useState<ComingSoonBadge[]>([]);
  const [showAllBadges, setShowAllBadges] = useState(false);
  const [recentWatched, setRecentWatched] = useState<RecentItem[]>([]);
  const [watchedCount, setWatchedCount] = useState(0);
  const [watchlist, setWatchlist] = useState<Movie[]>([]);
  const [userReviews, setUserReviews] = useState<UserReview[]>([]);

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
  }, []);

  const visibleBadges = showAllBadges ? badges : badges.slice(0, 3);

  return (
    <main className="p-6 pt-12 pb-32 max-w-2xl mx-auto space-y-16">
      {/* Header */}
      <div className="flex justify-between items-start">
        <Avatar className="h-32 w-32 ring-4 ring-primary/20 ring-offset-4 ring-offset-background shadow-2xl">
          <AvatarFallback className="bg-primary/20">
            <User className="h-14 w-14 text-primary" />
          </AvatarFallback>
        </Avatar>
        <Dialog open={showSettings} onOpenChange={setShowSettings}>
          <DialogTrigger asChild>
            <Button variant="outline" size="icon" className="rounded-full border-white/10 bg-white/5 hover:bg-white/10">
              <Settings className="h-5 w-5" />
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md rounded-3xl">
            <DialogHeader>
              <DialogTitle className="font-headline">Settings</DialogTitle>
            </DialogHeader>
            <div className="space-y-6 py-4">
              <div className="space-y-2">
                <h4 className="text-sm font-bold">Account</h4>
                <Button variant="ghost" className="w-full justify-start text-sm h-12 rounded-xl">Edit Profile</Button>
                <Button variant="ghost" className="w-full justify-start text-sm h-12 rounded-xl">Privacy Settings</Button>
              </div>
              <div className="space-y-2">
                <h4 className="text-sm font-bold">App</h4>
                <Button variant="ghost" className="w-full justify-start text-sm h-12 rounded-xl" onClick={() => toast({ title: 'Notifications updated' })}>Notification Preferences</Button>
                <Button variant="ghost" className="w-full justify-start text-sm h-12 rounded-xl">Help & Support</Button>
              </div>
              <Separator className="bg-white/5" />
              <Button variant="destructive" className="w-full rounded-xl h-12">Logout</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-4">
        <div>
          <h1 className="text-4xl font-headline font-bold">Your Profile</h1>
          <p className="text-muted-foreground text-lg">@username</p>
        </div>
        <p className="text-lg text-gray-400 leading-relaxed max-w-md">Set up your profile to track movies and connect with friends.</p>
        <div className="flex gap-10 pt-4">
          <div className="flex flex-col">
            <span className="text-2xl font-bold font-headline">0</span>
            <span className="text-xs text-muted-foreground uppercase tracking-widest font-bold">Following</span>
          </div>
          <div className="flex flex-col">
            <span className="text-2xl font-bold font-headline">0</span>
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

      {/* Rating Distribution */}
      <section className="space-y-6">
        <SectionHeader title="Rating Distribution" icon={Star} />
        <div className="h-64 w-full bg-white/5 rounded-[2.5rem] p-8 border border-white/5 shadow-inner">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={RATING_DATA}>
              <XAxis dataKey="rating" axisLine={false} tickLine={false} tick={{ fill: '#888', fontSize: 11, fontWeight: 'bold' }} />
              <YAxis hide />
              <ChartTooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ backgroundColor: '#1a1a1a', border: 'none', borderRadius: '12px' }} />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {RATING_DATA.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={parseInt(entry.rating) >= 7 ? 'hsl(var(--primary))' : 'hsl(var(--accent))'} opacity={0.9} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="text-center text-sm text-muted-foreground font-medium">Rate movies to build your chart</div>
      </section>

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
          seeAllContent={badges.length > 3 ? (
            <button
              onClick={() => setShowAllBadges(prev => !prev)}
              className="text-xs text-primary border border-primary/30 rounded-full px-3 py-1 hover:bg-primary/10 transition-colors font-semibold flex items-center gap-1"
            >
              {showAllBadges ? 'Show Less' : 'See All'} <ChevronRight className="h-3 w-3" />
            </button>
          ) : undefined}
        />

        {/* Tier guide */}
        <TierGuide />

        {/* Badge grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {visibleBadges.map(badge => (
            <BadgeCard key={badge.id} badge={badge} />
          ))}
        </div>

        {/* Coming Soon */}
        {comingSoon.length > 0 && (
          <div className="space-y-3 pt-2">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Coming Soon</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {comingSoon.map(b => (
                <ComingSoonCard key={b.id} badge={b} />
              ))}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
