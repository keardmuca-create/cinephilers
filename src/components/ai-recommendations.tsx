
"use client"

import React, { useEffect, useState } from 'react';
import { personalizeMovieRecommendations } from '@/ai/flows/personalized-movie-recommendations-flow';
import { Movie } from '@/lib/mock-data';
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
            { title: 'Neon Horizon', genre: 'Sci-Fi Action', rating: 5 },
            { title: 'The Great Heist', genre: 'Crime Drama', rating: 4 }
          ],
          preferredGenres: ['Sci-Fi', 'Thriller', 'Mystery']
        });

        const mapped = result.recommendations.map((rec, index) => {
          const existingMatch = MOCK_MOVIES.find(m => m.title.toLowerCase().includes(rec.title.toLowerCase()));
          if (existingMatch) return existingMatch;

          return {
            id: `ai-${index}`,
            title: rec.title,
            year: rec.year,
            genre: rec.genre,
            description: rec.description,
            rating: 8.0 + Math.random(),
            followingsRating: 7.5 + Math.random(),
            votes: 1200 + Math.floor(Math.random() * 5000),
            poster: `https://picsum.photos/seed/ai-${index}/400/600`,
            backdrop: `https://picsum.photos/seed/ai-${index}back/1200/600`,
            director: 'AI Generated',
            cast: [],
            reviews: [],
            quotes: [],
            trivia: [],
            type: 'movie'
          } as Movie;
        });

        setRecommendations(mapped);
      } catch {
        setRecommendations([]);
      } finally {
        setLoading(false);
      }
    };

    fetchRecs();
  }, []);

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
              <Skeleton className="h-[240px] w-40 rounded-xl" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))
        ) : (
          recommendations.map((movie) => (
            <MovieCard key={movie.id} movie={movie} />
          ))
        )}
      </div>
    </section>
  );
};
