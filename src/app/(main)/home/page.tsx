
"use client"

import React, { useEffect, useState, useMemo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Star, ChevronRight } from 'lucide-react';
import { Movie } from '@/lib/types';
import { MovieCard } from '@/components/movie-card';
import { WatchedEye } from '@/components/watched-eye';
import { readWatchedState, type WatchedState } from '@/lib/watched-state';
import { AIRecommendations } from '@/components/ai-recommendations';
import { InstallPrompt } from '@/components/install-prompt';
import { GetStarted } from '@/components/get-started';
import { RecentlyViewed } from '@/components/recently-viewed';
import { TodaysPick } from '@/components/todays-pick';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { usePopularMovies } from '@/hooks/use-movies';
import { seededShuffle } from '@/lib/seed-shuffle';
import { useAuth } from '@/contexts/auth-context';

const EMPTY = { movies: [] as Movie[], shows: [] as Movie[], trending: [] as Movie[] };

interface ChartEntry extends Movie {
  /** How many different people watched it this week — the thing being ranked. */
  watchers: number;
}

function Top10Card({ movie, index }: { movie: ChartEntry; index: number }) {
  const [watched, setWatched] = useState<WatchedState>('none');
  const [userRating, setUserRating] = useState<number | undefined>(undefined);

  useEffect(() => {
    try {
      setWatched(readWatchedState(movie.id));
      const r = localStorage.getItem(`movie-rating-${movie.id}`);
      if (r) setUserRating(parseInt(r, 10));
    } catch { /* ignore */ }
  }, [movie.id]);

  useEffect(() => {
    const handler = (e: Event) => {
      const { id, rating } = (e as CustomEvent<{ id: string; rating: number | null }>).detail;
      if (id === movie.id) setUserRating(rating ?? undefined);
    };
    window.addEventListener('cinephilers-rating-changed', handler);
    return () => window.removeEventListener('cinephilers-rating-changed', handler);
  }, [movie.id]);

  return (
    <Link href={`/movie/${movie.id}`} className="group shrink-0 w-36">
      <div className="relative aspect-[2/3] w-36 rounded-xl overflow-hidden shadow-xl movie-card-hover border border-border mb-3">
        <Image src={movie.poster} alt={movie.title} fill className="object-cover" />
        {/* Rank number overlaid inside the poster, bottom-left */}
        <span
          className="absolute bottom-0 left-1 text-[72px] leading-none font-headline font-black text-transparent pointer-events-none select-none"
          style={{ WebkitTextStroke: '2px rgba(255,255,255,0.35)' }}
        >
          {index + 1}
        </span>
      </div>
      <div className="space-y-1 px-1">
        <div className="flex items-start justify-between gap-1">
          <h3 className="text-sm font-semibold font-headline line-clamp-2 group-hover:text-primary transition-colors leading-snug">
            {movie.title}
          </h3>
          <div className="flex flex-col items-end gap-0.5 shrink-0">
            {movie.rating > 0 && (
              <div className="flex items-center gap-0.5">
                <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                <span className="text-xs font-bold text-foreground">{movie.rating.toFixed(1)}</span>
              </div>
            )}
            {userRating !== undefined && (
              <div className="flex items-center gap-0.5">
                <Star className="h-3 w-3 fill-blue-400 text-blue-400" />
                <span className="text-[10px] font-bold text-blue-400">{userRating}</span>
              </div>
            )}
            {(watched !== 'none' || userRating !== undefined) && (
              // A rating implies you've seen it — but only enough to fill the eye
              // when the episodes don't already say you're partway through.
              <WatchedEye state={watched === 'partial' ? 'partial' : 'complete'} className="h-4 w-4" />
            )}
          </div>
        </div>
        {/* The rank is earned by this number, so the number is on the card. */}
        <p className="text-xs text-muted-foreground">
          {movie.watchers} {movie.watchers === 1 ? 'watcher' : 'watchers'} · {movie.year}
        </p>
      </div>
    </Link>
  );
}

const SectionHeader = ({ title, seeAllSection }: { title: string; seeAllSection?: string }) => (
  <div className="flex items-center justify-between px-6">
    <div className="flex items-center gap-3">
      <div className="w-1 h-5 bg-primary rounded-full" />
      <h2 className="text-xl font-headline font-bold">{title}</h2>
    </div>
    {seeAllSection && (
      <Link
        href={`/see-all/${seeAllSection}`}
        className="text-xs text-primary border border-primary/30 rounded-full px-3 py-1 hover:bg-primary/10 transition-colors font-semibold flex items-center gap-1"
      >
        See All <ChevronRight className="h-3 w-3" />
      </Link>
    )}
  </div>
);

const CardRowSkeleton = () => (
  <div className="flex gap-4 px-6 pb-4">
    {Array(5).fill(0).map((_, i) => (
      <div key={i} className="space-y-3 shrink-0">
        <Skeleton className="h-[216px] w-36 rounded-xl" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-20" />
      </div>
    ))}
  </div>
);

export default function HomePage() {
  const { data, loading } = usePopularMovies(EMPTY);
  const { user, loading: authLoading } = useAuth();

  // Stable pools — frozen in Redis per day/week, identical across all devices
  const [stablePool, setStablePool] = useState<{ daily: Movie[]; weekly: Movie[] }>({ daily: [], weekly: [] });
  useEffect(() => {
    fetch('/api/home-pool')
      .then(r => r.json())
      .then((pool: { daily?: Movie[]; weekly?: Movie[] }) => {
        if (Array.isArray(pool?.daily)) {
          setStablePool({ daily: pool.daily, weekly: Array.isArray(pool.weekly) ? pool.weekly : pool.daily });
        }
      })
      .catch(() => {});
  }, []);

  // Most Watched This Week — real Cinephilers activity, ranked by how many
  // different people watched each title. The endpoint decides whether there is
  // enough of it to be worth showing; an empty list means "not yet" and the row
  // simply isn't drawn.
  const [chart, setChart] = useState<ChartEntry[]>([]);
  useEffect(() => {
    fetch('/api/top-watched')
      .then(r => r.json())
      .then((res: { ready?: boolean; items?: ChartEntry[] }) => {
        if (res?.ready && Array.isArray(res.items)) setChart(res.items);
      })
      .catch(() => {});
  }, []);

  const featured = useMemo(() => {
    if (!stablePool.daily.length) return [] as Movie[];
    const now = new Date();
    const daySeed = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
    return seededShuffle(stablePool.daily, daySeed).slice(1, 16);
  }, [stablePool]);

  // Popular sections: all 25 items each
  const popularMovies = data.movies;
  const popularShows = data.shows;

  return (
    <main className="flex flex-col gap-10 pb-20">
      {/* Install-app banner: native install dialog on Chromium, Share-sheet
          guide on iOS; hides itself when installed or dismissed */}
      <InstallPrompt />

      {/* The rest of onboarding — genres, a history, a watchlist. Hides itself
          once the three are done, and can be dismissed before then. */}
      <GetStarted />

      {/* Guest signup banner */}
      {!authLoading && !user && (
        <div className="px-6 pt-6 -mb-4">
          <div className="bg-primary/10 border border-primary/20 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-3 max-w-3xl mx-auto">
            <div className="space-y-1 flex-1">
              <p className="font-bold text-base">Join Cinephilers</p>
              <p className="text-sm text-muted-foreground">Track every movie and show you watch, rate them, and follow friends.</p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button asChild size="sm" className="rounded-xl font-bold"><Link href="/signup">Sign Up</Link></Button>
              <Button asChild size="sm" variant="outline" className="rounded-xl font-bold"><Link href="/login">Log In</Link></Button>
            </div>
          </div>
        </div>
      )}

      {/* Today's Pick — a Generate banner shown to everyone; logged-in users
          reveal a released, unwatched film from their watchlist (locked for the
          day, broadcast to followers); guests get a signup nudge. */}
      <TodaysPick />

      {/* Featured Today */}
      <section className="space-y-4">
        <SectionHeader title="Featured Today" seeAllSection={featured.length > 0 ? 'featured' : undefined} />
        {loading ? <CardRowSkeleton /> : featured.length > 0 ? (
          <div className="flex overflow-x-auto gap-4 px-6 pb-4 no-scrollbar">
            {featured.map(movie => <MovieCard key={movie.id} movie={movie} />)}
          </div>
        ) : null}
      </section>

      {/* Most Watched This Week — hidden until there's enough real activity to
          rank, so it never publishes one person's diary as a chart. */}
      {chart.length > 0 && (
        <section className="space-y-4">
          <SectionHeader title="Most Watched This Week" />
          <div className="flex overflow-x-auto gap-4 px-6 pb-6 no-scrollbar">
            {chart.map((movie, index) => (
              <Top10Card key={movie.id} movie={movie} index={index} />
            ))}
          </div>
        </section>
      )}

      {/* AI Picks */}
      <AIRecommendations />

      {/* Popular Movies */}
      <section className="space-y-4">
        <SectionHeader title="Popular Movies" seeAllSection={popularMovies.length > 0 ? 'popular-movies' : undefined} />
        {loading ? <CardRowSkeleton /> : popularMovies.length > 0 ? (
          <div className="flex overflow-x-auto gap-4 px-6 pb-4 no-scrollbar">
            {popularMovies.map(movie => <MovieCard key={movie.id} movie={movie} />)}
          </div>
        ) : null}
      </section>

      {/* Popular TV Shows */}
      <section className="space-y-4">
        <SectionHeader title="Popular TV Shows" seeAllSection={popularShows.length > 0 ? 'popular-shows' : undefined} />
        {loading ? <CardRowSkeleton /> : popularShows.length > 0 ? (
          <div className="flex overflow-x-auto gap-4 px-6 pb-4 no-scrollbar">
            {popularShows.map(show => <MovieCard key={show.id} movie={show} />)}
          </div>
        ) : null}
      </section>

      {/* Recently Viewed */}
      <RecentlyViewed />
    </main>
  );
}
