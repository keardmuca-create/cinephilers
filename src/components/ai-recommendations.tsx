"use client"

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Movie } from '@/lib/types';
import { MovieCard } from './movie-card';
import { Skeleton } from '@/components/ui/skeleton';
import { Sparkles, ChevronRight } from 'lucide-react';

// Films only, deliberately — the Movies/Shows toggle is gone from this row. A bad
// film suggestion costs two hours; a bad series costs a dozen, and a season is
// too big an ask to hang on a guess. Everywhere else in the app still splits.
export const AIRecommendations = () => {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/recommendations')
      .then(r => r.json())
      .then((data: { topMovies?: Movie[] }) => {
        setMovies(data.topMovies ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (!loading && movies.length === 0) return null;

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
          href="/see-all/top-picks-movies"
          className="text-xs text-primary border border-primary/30 rounded-full px-3 py-1 hover:bg-primary/10 transition-colors font-semibold flex items-center gap-1 shrink-0"
        >
          See All <ChevronRight className="h-3 w-3" />
        </Link>
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
          : movies.map(movie => <MovieCard key={movie.id} movie={movie} />)
        }
      </div>
    </section>
  );
};
