
"use client"

import React, { useState, useEffect } from 'react';
import { Movie } from '@/lib/types';
import { readUserStats, computeAllBadges, getComingSoonBadges, ensureSignupDate, ComputedBadge, ComingSoonBadge } from '@/lib/badges';
import { BadgeCard, ComingSoonCard, TierGuide } from '@/components/badge-card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { MovieCard } from '@/components/movie-card';
import Link from 'next/link';
import { Settings, Star, Film, List, MessageSquare, ChevronRight, Award, History, Bookmark, User, Eye } from 'lucide-react';
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

const MovieListDialog = ({ title, movies }: { title: string; movies: Movie[] }) => (
  <Dialog>
    <DialogTrigger asChild>
      <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary transition-colors">
        See All <ChevronRight className="h-4 w-4 ml-1" />
      </Button>
    </DialogTrigger>
    <DialogContent className="max-w-3xl rounded-[2.5rem] h-[80vh] flex flex-col p-0 bg-background/95 backdrop-blur-xl border-white/10">
      <DialogHeader className="p-8 pb-2">
        <DialogTitle className="font-headline text-3xl font-bold">{title}</DialogTitle>
      </DialogHeader>
      <ScrollArea className="flex-1 px-8 pb-8">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6 pt-4">
          {movies.map(movie => <MovieCard key={movie.id} movie={movie} className="w-full" />)}
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


export default function ProfilePage() {
  const [showSettings, setShowSettings] = useState(false);
  const [badges, setBadges] = useState<ComputedBadge[]>([]);
  const [comingSoon, setComingSoon] = useState<ComingSoonBadge[]>([]);
  const [showAllBadges, setShowAllBadges] = useState(false);
  const [recentWatched, setRecentWatched] = useState<RecentItem[]>([]);

  const watchlist: Movie[] = [];

  useEffect(() => {
    ensureSignupDate();
    setBadges(computeAllBadges(readUserStats()));
    setComingSoon(getComingSoonBadges());

    // Build recent watch preview from actual watched-* keys (source of truth)
    try {
      // Collect watched movie IDs
      const movieIds: string[] = [];
      const showIds = new Set<string>();
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)!;
        if (k.startsWith('watched-') && !k.startsWith('watched-ep-') && localStorage.getItem(k) === 'true') {
          const id = k.slice('watched-'.length);
          if (!id.startsWith('tmdb-tv-')) movieIds.push(id);
        }
        if (k.startsWith('watched-ep-')) {
          const m = k.slice('watched-ep-'.length).match(/^(.+)-S\d+E\d+$/);
          if (m) showIds.add(m[1]);
        }
      }

      // Merge and keep only IDs with cached metadata
      const allIds = [...movieIds, ...Array.from(showIds)];
      const items: RecentItem[] = [];
      for (const id of allIds) {
        const raw = localStorage.getItem(`meta-${id}`);
        if (!raw) continue;
        const meta = JSON.parse(raw);
        // For shows, skip if 0 episodes watched
        if (id.startsWith('tmdb-tv-')) {
          let epCount = 0;
          const pfx = `watched-ep-${id}-`;
          for (let i = 0; i < localStorage.length; i++)
            if (localStorage.key(i)!.startsWith(pfx)) epCount++;
          if (epCount === 0) continue;
        }
        const rating = localStorage.getItem(`movie-rating-${id}`);
        items.push({
          id,
          title: meta.title,
          poster: meta.poster,
          year: meta.year ?? '',
          loggedAt: '',
          rating: rating ? Number(rating) : undefined,
          tmdbRating: typeof meta.tmdbRating === 'number' ? meta.tmdbRating : undefined,
        });
      }
      setRecentWatched(items.slice(0, 50));
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
        <SectionHeader
          title="Watch History"
          icon={History}
          seeAllContent={
            <Link href="/history">
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary transition-colors">
                See All <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          }
        />
        {recentWatched.length > 0 ? (
          <div className="flex overflow-x-auto gap-4 pb-4 no-scrollbar -mx-6 px-6">
            {recentWatched.map(item => (
              <Link key={item.id} href={`/movie/${item.id}`} className="group shrink-0 w-44">
                <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-muted shadow-lg movie-card-hover mb-3">
                  <img src={item.poster} alt={item.title} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                  {/* Eye icon top-right */}
                  <div className="absolute top-2 right-2">
                    <div className="h-7 w-7 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center">
                      <Eye className="h-4 w-4 text-blue-400" />
                    </div>
                  </div>
                  {/* TMDB rating bottom-left */}
                  {item.tmdbRating !== undefined && (
                    <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-black/70 backdrop-blur-sm rounded-md px-1.5 py-0.5">
                      <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                      <span className="text-xs font-bold text-white">{item.tmdbRating.toFixed(1)}</span>
                    </div>
                  )}
                  {/* User rating bottom-right */}
                  {item.rating !== undefined && (
                    <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-black/70 backdrop-blur-sm rounded-md px-1.5 py-0.5">
                      <Star className="h-3 w-3 fill-blue-400 text-blue-400" />
                      <span className="text-xs font-bold text-blue-400">{item.rating}</span>
                    </div>
                  )}
                </div>
                <div className="space-y-1 px-1">
                  <h3 className="text-sm font-semibold font-headline line-clamp-2 group-hover:text-primary transition-colors leading-snug">
                    {item.title}
                  </h3>
                  <p className="text-xs text-muted-foreground">{item.year}</p>
                </div>
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

      {/* Custom Lists */}
      <section className="space-y-6">
        <SectionHeader title="Custom Lists" icon={List} />
        <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
          <p className="text-sm text-muted-foreground">Create lists to organise your movies</p>
          <Button variant="outline" className="rounded-full border-white/10 bg-white/5 px-6">
            <Film className="h-4 w-4 mr-2" /> Create a List
          </Button>
        </div>
      </section>

      {/* Reviews */}
      <section>
        <SectionHeader title="Recent Reviews" icon={MessageSquare} />
        <EmptyRow message="Your reviews will appear here" />
      </section>

      {/* Badges */}
      <section className="space-y-4">
        <SectionHeader title="Badges & Achievements" icon={Award} />

        {/* Tier guide */}
        <TierGuide />

        {/* Badge grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {visibleBadges.map(badge => (
            <BadgeCard key={badge.id} badge={badge} />
          ))}
        </div>

        {/* See all / show less */}
        {badges.length > 3 && (
          <button
            onClick={() => setShowAllBadges(prev => !prev)}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-muted-foreground hover:text-white border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
          >
            {showAllBadges ? 'Show Less' : `See All ${badges.length} Badges`}
          </button>
        )}

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
