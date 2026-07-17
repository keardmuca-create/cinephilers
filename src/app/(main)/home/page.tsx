
"use client"

import React, { useEffect, useState, useMemo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Play, Star, ChevronRight, Info, Eye } from 'lucide-react';
import { Movie } from '@/lib/types';
import { MovieCard } from '@/components/movie-card';
import { AIRecommendations } from '@/components/ai-recommendations';
import { InstallPrompt } from '@/components/install-prompt';
import { RecentlyViewed } from '@/components/recently-viewed';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { usePopularMovies } from '@/hooks/use-movies';
import { seededShuffle } from '@/lib/seed-shuffle';
import { useAuth } from '@/contexts/auth-context';

const EMPTY = { movies: [] as Movie[], shows: [] as Movie[], trending: [] as Movie[] };

function Top10Card({ movie, index }: { movie: Movie; index: number }) {
  const [watched, setWatched] = useState(false);
  const [userRating, setUserRating] = useState<number | undefined>(undefined);

  useEffect(() => {
    try {
      if (localStorage.getItem(`watched-${movie.id}`) === 'true') setWatched(true);
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
            <div className="flex items-center gap-0.5">
              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
              <span className="text-xs font-bold text-foreground">{movie.rating.toFixed(1)}</span>
            </div>
            {userRating !== undefined && (
              <div className="flex items-center gap-0.5">
                <Star className="h-3 w-3 fill-blue-400 text-blue-400" />
                <span className="text-[10px] font-bold text-blue-400">{userRating}</span>
              </div>
            )}
            {(watched || userRating !== undefined) && (
              <Eye className="h-4 w-4 text-blue-400" />
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{movie.year}</p>
      </div>
    </Link>
  );
}

// IMDb-style weighted rating so "Top 10" needs both a high score AND enough
// votes — a 9.0 with 12 votes won't outrank an 8.2 with 50k.
const WEIGHTED_MIN_VOTES = 100;
const GLOBAL_MEAN_RATING = 6.5;
function weightedScore(m: Movie): number {
  const v = m.votes ?? 0;
  const r = m.rating ?? 0;
  return (v / (v + WEIGHTED_MIN_VOTES)) * r
    + (WEIGHTED_MIN_VOTES / (v + WEIGHTED_MIN_VOTES)) * GLOBAL_MEAN_RATING;
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

const HeroSkeleton = () => (
  <section className="relative h-[75vh] w-full px-6 pt-6">
    <div className="h-full w-full rounded-[2.5rem] bg-muted animate-pulse" />
  </section>
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

  const { heroMovie, featured, top10 } = useMemo(() => {
    if (!stablePool.daily.length) return { heroMovie: null, featured: [] as Movie[], top10: [] as Movie[] };

    const now = new Date();
    const daySeed = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();

    const dailyPool = seededShuffle(stablePool.daily, daySeed);

    const hero = dailyPool.find(m => m.type === 'movie') ?? null;
    const feat = dailyPool.slice(1, 16);
    // Genuine top 10 by weighted rating (not a random slice). The weekly pool
    // changes each week, so the ranking still rotates over time.
    const t10 = [...stablePool.weekly]
      .sort((a, b) => weightedScore(b) - weightedScore(a))
      .slice(0, 10);

    return { heroMovie: hero, featured: feat, top10: t10 };
  }, [stablePool]);

  // Popular sections: all 25 items each
  const popularMovies = data.movies;
  const popularShows = data.shows;

  return (
    <main className="flex flex-col gap-10 pb-20">
      {/* Install-app banner: native install dialog on Chromium, Share-sheet
          guide on iOS; hides itself when installed or dismissed */}
      <InstallPrompt />

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

      {/* Hero Section */}
      {loading || !heroMovie ? (
        <HeroSkeleton />
      ) : (
        <section className="relative h-[75vh] w-full px-6 pt-6">
          <div className="relative h-full w-full rounded-[2.5rem] overflow-hidden group shadow-2xl">
            <Image
              src={heroMovie.backdrop}
              alt={heroMovie.title}
              fill
              className="object-cover"
            />
            <div className="absolute inset-0 cinematic-gradient" />

            <div className="absolute bottom-0 left-0 right-0 p-5 md:p-8">
              <div className="backdrop-blur-xl bg-black/30 border border-white/10 rounded-3xl p-6 md:p-8 space-y-4 max-w-2xl">
                <div className="flex items-center gap-2">
                  <span className="bg-primary text-primary-foreground px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest">
                    Today&apos;s Pick
                  </span>
                  <div className="flex items-center gap-1 text-accent font-bold text-sm">
                    <Star className="h-4 w-4 fill-current" />
                    {heroMovie.rating.toFixed(1)}
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-white/40 border border-white/10 px-2 py-0.5 rounded-full">
                    {heroMovie.genre.split(' ')[0]}
                  </span>
                </div>
                <h1 className="text-3xl md:text-5xl font-headline font-bold leading-tight">
                  {heroMovie.title}
                </h1>
                <p className="text-sm md:text-base text-white/70 line-clamp-2 font-medium">
                  {heroMovie.description}
                </p>
                <div className="flex flex-wrap gap-3 pt-2">
                  <Button asChild className="rounded-full h-12 px-8 bg-accent hover:bg-accent/90 text-white font-bold transition-all hover:scale-105 active:scale-95">
                    <Link href={`/movie/${heroMovie.id}`}>
                      <Play className="h-4 w-4 mr-2 fill-current" /> Watch Trailer
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="rounded-full h-12 px-8 border-white/20 bg-white/5 hover:bg-white/10 text-white font-bold">
                    <Link href={`/movie/${heroMovie.id}`}>
                      <Info className="h-4 w-4 mr-2" /> More Info
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Featured Today */}
      <section className="space-y-4">
        <SectionHeader title="Featured Today" seeAllSection={featured.length > 0 ? 'featured' : undefined} />
        {loading ? <CardRowSkeleton /> : featured.length > 0 ? (
          <div className="flex overflow-x-auto gap-4 px-6 pb-4 no-scrollbar">
            {featured.map(movie => <MovieCard key={movie.id} movie={movie} />)}
          </div>
        ) : null}
      </section>

      {/* Top 10 on Cinephilers */}
      {top10.length > 0 && (
        <section className="space-y-4">
          <SectionHeader title="Top 10 on Cinephilers This Week" />
          <div className="flex overflow-x-auto gap-4 px-6 pb-6 no-scrollbar">
            {top10.map((movie, index) => (
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
