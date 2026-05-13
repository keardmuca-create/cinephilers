
"use client"

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Play, Star, ChevronRight, Info } from 'lucide-react';
import { Movie } from '@/lib/types';
import { MovieCard } from '@/components/movie-card';
import { AIRecommendations } from '@/components/ai-recommendations';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { usePopularMovies } from '@/hooks/use-movies';

const EMPTY = { movies: [] as Movie[], shows: [] as Movie[], trending: [] as Movie[] };

const SectionHeader = ({ title, dialog }: { title: string; dialog?: React.ReactNode }) => (
  <div className="flex items-center justify-between px-6">
    <div className="flex items-center gap-3">
      <div className="w-1 h-5 bg-primary rounded-full" />
      <h2 className="text-xl font-headline font-bold">{title}</h2>
    </div>
    {dialog}
  </div>
);

const SeeAllPill = ({ title, movies }: { title: string; movies: Movie[] }) => (
  <Dialog>
    <DialogTrigger asChild>
      <button className="text-xs text-primary border border-primary/30 rounded-full px-3 py-1 hover:bg-primary/10 transition-colors font-semibold flex items-center gap-1">
        See All <ChevronRight className="h-3 w-3" />
      </button>
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

  const heroMovie = data.trending[0] ?? null;
  const featured = data.trending.slice(1, 6);
  const top10 = data.trending.slice(0, 10);
  const popular = data.movies.slice(0, 5);

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
                    {heroMovie.rating}
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
                  <Button className="rounded-full h-12 px-8 bg-accent hover:bg-accent/90 text-white font-bold transition-all hover:scale-105 active:scale-95">
                    <Play className="h-4 w-4 mr-2 fill-current" /> Watch Trailer
                  </Button>
                  <Link href={`/movie/${heroMovie.id}`}>
                    <Button variant="outline" className="rounded-full h-12 px-8 border-white/20 bg-white/5 hover:bg-white/10 text-white font-bold">
                      <Info className="h-4 w-4 mr-2" /> More Info
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Featured Today */}
      <section className="space-y-4">
        <SectionHeader title="Featured Today" dialog={featured.length > 0 ? <SeeAllPill title="Featured Today" movies={data.trending} /> : undefined} />
        {loading ? <CardRowSkeleton /> : featured.length > 0 ? (
          <div className="flex overflow-x-auto gap-4 px-6 pb-4 no-scrollbar">
            {featured.map(movie => <MovieCard key={movie.id} movie={movie} />)}
          </div>
        ) : null}
      </section>

      {/* Top 10 */}
      {top10.length > 0 && (
        <section className="space-y-4">
          <SectionHeader title="Top 10 This Week" dialog={<SeeAllPill title="Top 10 This Week" movies={top10} />} />
          <div className="flex overflow-x-auto gap-8 px-6 pb-6 no-scrollbar items-end">
            {top10.map((movie, index) => (
              <Link href={`/movie/${movie.id}`} key={movie.id} className="relative group shrink-0">
                <div className="flex items-end">
                  <span
                    className="text-[140px] leading-none font-headline font-black text-transparent -mb-4 -mr-6 z-0"
                    style={{ WebkitTextStroke: '2px rgba(255,255,255,0.15)' }}
                  >
                    {index + 1}
                  </span>
                  <div className="relative aspect-[2/3] w-32 rounded-lg overflow-hidden shadow-xl movie-card-hover z-10 border border-white/10">
                    <Image src={movie.poster} alt={movie.title} fill className="object-cover" />
                  </div>
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
        <SectionHeader title="Popular Movies" dialog={popular.length > 0 ? <SeeAllPill title="Popular Movies" movies={data.movies} /> : undefined} />
        {loading ? <CardRowSkeleton /> : popular.length > 0 ? (
          <div className="flex overflow-x-auto gap-4 px-6 pb-4 no-scrollbar">
            {popular.map(movie => <MovieCard key={movie.id} movie={movie} />)}
          </div>
        ) : null}
      </section>
    </main>
  );
}
