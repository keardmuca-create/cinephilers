"use client"

import React, { useEffect, useState } from 'react';
import { personalizeMovieRecommendations } from '@/ai/flows/personalized-movie-recommendations-flow';
import { Movie } from '@/lib/types';
import { MovieCard } from './movie-card';
import { Skeleton } from '@/components/ui/skeleton';
import { Sparkles } from 'lucide-react';

export const AIRecommendations = () => {
  const [recommendations, setRecommendations] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRecs = async () => {
      try {
        const result = await personalizeMovieRecommendations({
          userId: 'u1',
          watchedHistory: [
            { title: 'Inception', genre: 'Sci-Fi Thriller', rating: 5 },
            { title: 'The Dark Knight', genre: 'Action Crime', rating: 5 },
          ],
          preferredGenres: ['Sci-Fi', 'Thriller', 'Mystery'],
        });

        // Resolve each AI-suggested title to a real TMDB entry in parallel
        const settled = await Promise.allSettled(
          result.recommendations.map(rec =>
            fetch(`/api/movies/search?q=${encodeURIComponent(rec.title)}`)
              .then(r => r.json() as Promise<{ results?: Movie[] }>)
              .then(json => json.results?.[0] ?? null),
          ),
        );

        const movies: Movie[] = settled
          .filter((s): s is PromiseFulfilledResult<Movie> => s.status === 'fulfilled' && s.value !== null)
          .map(s => s.value);

        setRecommendations(movies);
      } catch {
        setRecommendations([]);
      } finally {
        setLoading(false);
      }
    };

    fetchRecs();
  }, []);

  if (!loading && recommendations.length === 0) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2 px-6">
        <Sparkles className="h-4 w-4 text-accent" />
        <h2 className="text-xl font-headline font-bold">Top Picks For You</h2>
      </div>

      <div className="flex overflow-x-auto gap-4 px-6 pb-4 no-scrollbar">
        {loading ? (
          Array(5).fill(0).map((_, i) => (
            <div key={i} className="space-y-3 shrink-0">
              <Skeleton className="h-[240px] w-44 rounded-xl" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))
        ) : (
          recommendations.map(movie => (
            <MovieCard key={movie.id} movie={movie} />
          ))
        )}
      </div>
    </section>
  );
};
