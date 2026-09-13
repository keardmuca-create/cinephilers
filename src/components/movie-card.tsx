
"use client"

import React, { useState, useEffect } from 'react';
import { Movie } from '@/lib/types';
import { WatchedEye } from '@/components/watched-eye';
import { PosterCard, ScoreStar, UserScore } from '@/components/poster-card';
import { readWatchedState, type WatchedState } from '@/lib/watched-state';
import { readUserRating } from '@/lib/library-store';
import { useCommunityRatings } from '@/hooks/use-community-ratings';
import { resolveDisplayRating } from '@/lib/cinephilers-rating';

interface MovieCardProps {
  movie: Movie;
  className?: string;
  horizontal?: boolean;
}

export const MovieCard = React.memo(function MovieCard({ movie, className }: MovieCardProps) {
  const [watched, setWatched] = useState<WatchedState>('none');
  const [userRating, setUserRating] = useState<number | undefined>(undefined);
  // Asked per card, answered per screen: the batcher gathers every card
  // rendering in the same tick into one request.
  const cine = useCommunityRatings([movie.id]);
  const shown = resolveDisplayRating(movie.rating, cine[movie.id]);

  useEffect(() => {
    try {
      setWatched(readWatchedState(movie.id));
      const r = readUserRating(movie.id);
      if (r) setUserRating(r);
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

  // Scores above the title, the same card as the profile shelves — they used to sit
  // in a column beside the title here, and in a row above it there.
  return (
    <PosterCard
      href={`/movie/${movie.id}`}
      poster={movie.poster}
      title={movie.title}
      secondLine={movie.year}
      className={className}
      badges={<>
        {shown && <ScoreStar value={shown.value} source={shown.source} />}
        {userRating !== undefined && <UserScore value={userRating} />}
        {watched !== 'none' && <WatchedEye state={watched} className="h-3.5 w-3.5" />}
      </>}
    />
  );
});
