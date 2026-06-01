
"use client"

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Play, Star, ChevronRight, Info } from 'lucide-react';
import { Movie } from '@/lib/types';
import { MovieCard } from '@/components/movie-card';
import { AIRecommendations } from '@/components/ai-recommendations';
import { RecentlyViewed } from '@/components/recently-viewed';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { usePopularMovies } from '@/hooks/use-movies';

const EMPTY = { movies: [] as Movie[], shows: [] as Movie[], trending: [] as Movie[] };

// Seeded PRNG — same seed always produces the same shuffle
function seededShuffle<T>(arr: T[], seed: number): T[] {
  let s = seed | 0;
  const rng = () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const DAY_MS  = 86_400_000;
const WEEK_MS = DAY_MS * 7;

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
        <Skeleton className="h-[240px] w-44 rounded-xl" />
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

  // Deduplicated pool of everything fetched
  const allMovies = Array.from(
    new Map([...data.trending, ...data.movies, ...data.shows].map(m => [m.id, m])).values()
  );

  const daySeed  = Math.floor(Date.now() / DAY_MS);
  const weekSeed = Math.floor(Date.now() / WEEK_MS) + 99_999; // offset so weekly ≠ daily

  const dailyPool  = seededShuffle(allMovies, daySeed);
  const weeklyPool = seededShuffle(allMovies, weekSeed);

  // Today's Pick hero — first movie (not show) in daily pool
  const heroMovie = dailyPool.find(m => m.type === 'movie') ?? null;

  // Featured Today — next 15 from daily pool (skip hero)
  const featured = dailyPool.slice(1, 16);

  // Top 10 This Week — weekly pool, skip any already in featured or hero
  const featuredIds = new Set([heroMovie?.id, ...featured.map(m => m.id)]);
  const top10 = weeklyPool.filter(m => !featuredIds.has(m.id)).slice(0, 10);

  // Popular sections: all 25 items each
  const popularMovies = data.movies;
  const popularShows = data.shows;

  return (
    <main className="flex flex-col gap-10 pb-20">
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
              className="object-cover transition-transform duration-1000 group-hover:scale-105"
              priority
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
              <Link href={`/movie/${movie.id}`} key={movie.id} className="group shrink-0 w-44">
                <div className="relative aspect-[2/3] w-44 rounded-xl overflow-hidden shadow-xl movie-card-hover border border-white/10 mb-3">
                  <Image src={movie.poster} alt={movie.title} fill className="object-cover transition-transform group-hover:scale-110" />
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
                    <div className="flex items-center gap-0.5 shrink-0">
                      <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                      <span className="text-xs font-bold text-foreground">{movie.rating.toFixed(1)}</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{movie.year}</p>
                </div>
              </Link>
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
