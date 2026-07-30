"use client"

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Movie } from '@/lib/types';
import { MovieCard } from './movie-card';
import { Skeleton } from '@/components/ui/skeleton';
import { Sparkles, ChevronRight } from 'lucide-react';
import { MediaToggle } from './media-toggle';
import type { MediaSide } from '@/lib/media-type';

type Tab = MediaSide;

export const AIRecommendations = () => {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [shows, setShows] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('movies');

  useEffect(() => {
    fetch('/api/recommendations')
      .then(r => r.json())
      .then((data: { topMovies?: Movie[]; topShows?: Movie[] }) => {
        setMovies(data.topMovies ?? []);
        setShows(data.topShows ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (!loading && movies.length === 0 && shows.length === 0) return null;

  const displayed = tab === 'movies' ? movies : shows;
  const seeAllHref = tab === 'movies' ? '/see-all/top-picks-movies' : '/see-all/top-picks-shows';

  return (
    <section className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <div className="w-1 h-5 bg-primary rounded-full" />
          <h2 className="text-xl font-headline font-bold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-accent" />
            Top Picks For You
          </h2>
        </div>
        <Link
          href={seeAllHref}
          className="text-xs text-primary border border-primary/30 rounded-full px-3 py-1 hover:bg-primary/10 transition-colors font-semibold flex items-center gap-1 shrink-0"
        >
          See All <ChevronRight className="h-3 w-3" />
        </Link>
      </div>

      {/* Movies / Shows toggle — the shared pill every list now uses. */}
      <div className="px-6">
        <MediaToggle value={tab} onChange={setTab} />
      </div>

      {/* Card row */}
      <div className="flex overflow-x-auto gap-4 px-6 pb-4 no-scrollbar">
        {loading
          ? Array(5).fill(0).map((_, i) => (
              <div key={i} className="space-y-3 shrink-0">
                <Skeleton className="h-[216px] w-36 rounded-xl" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
            ))
          : displayed.map(movie => <MovieCard key={movie.id} movie={movie} />)
        }
      </div>
    </section>
  );
};
