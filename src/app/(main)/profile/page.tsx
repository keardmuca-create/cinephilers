
"use client"

import React, { useState, useEffect } from 'react';
import { Movie } from '@/lib/types';
import { readUserStats, computeAllBadges, ensureSignupDate, ComputedBadge } from '@/lib/badges';
import { BadgeCard } from '@/components/badge-card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { MovieCard } from '@/components/movie-card';
import { Settings, Star, Film, List, MessageSquare, ChevronRight, Award, History, Heart, Bookmark, User } from 'lucide-react';
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

export default function ProfilePage() {
  const [showSettings, setShowSettings] = useState(false);
  const [badges, setBadges] = useState<ComputedBadge[]>([]);

  const watched: Movie[] = [];
  const watchlist: Movie[] = [];
  const favorites: Movie[] = [];

  useEffect(() => {
    ensureSignupDate();
    setBadges(computeAllBadges(readUserStats()));
  }, []);

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
        <SectionHeader title="Favorite Movies" icon={Heart} />
        {favorites.length > 0 ? (
          <div className="grid grid-cols-3 gap-4">
            {favorites.map(m => (
              <div key={m.id} className="relative aspect-[2/3] rounded-2xl overflow-hidden border border-white/10 shadow-lg group cursor-pointer">
                <img src={m.poster} alt={m.title} className="object-cover w-full h-full group-hover:scale-110 transition-transform" />
              </div>
            ))}
          </div>
        ) : (
          <EmptyRow message="No favorites yet — rate movies to add them here" />
        )}
      </section>

      {/* Watch History */}
      <section>
        <SectionHeader
          title="Watch History"
          icon={History}
          seeAllContent={watched.length > 0 ? <MovieListDialog title="Watch History" movies={watched} /> : undefined}
        />
        {watched.length > 0 ? (
          <div className="flex overflow-x-auto gap-4 pb-4 no-scrollbar">
            {watched.map(m => <MovieCard key={m.id} movie={m} horizontal />)}
          </div>
        ) : (
          <EmptyRow message="Movies you watch will appear here" />
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
      <section>
        <SectionHeader title="Badges & Achievements" icon={Award} />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {badges.map(badge => (
            <BadgeCard key={badge.id} badge={badge} />
          ))}
        </div>
      </section>
    </main>
  );
}
