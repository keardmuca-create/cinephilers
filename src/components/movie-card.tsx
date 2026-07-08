
"use client"

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Star, Eye, Film } from 'lucide-react';
import { Movie } from '@/lib/types';
import { cn } from '@/lib/utils';

interface MovieCardProps {
  movie: Movie;
  className?: string;
  horizontal?: boolean;
}

export const MovieCard = React.memo(function MovieCard({ movie, className, horizontal = false }: MovieCardProps) {
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
    <Link href={`/movie/${movie.id}`} className={cn("block shrink-0", className)}>
      <div className={cn(
        "group flex flex-col",
        horizontal ? "w-40" : "w-44"
      )}>
        <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-muted shadow-lg movie-card-hover mb-3">
          {movie.poster ? (
            <Image
              src={movie.poster}
              alt={movie.title}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 160px, 200px"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-muted">
              <Film className="h-10 w-10 text-primary/60" />
            </div>
          )}
        </div>

        {/* Title + year stack together on the left so the year always sits
            right under the title — the badge column's height can't push it down. */}
        <div className="flex items-start justify-between gap-1 px-1">
          <div className="space-y-1 min-w-0">
            <h3 className="text-sm font-semibold font-headline line-clamp-2 group-hover:text-primary transition-colors leading-snug">
              {movie.title}
            </h3>
            <p className="text-xs text-muted-foreground line-clamp-1">
              {movie.year}
            </p>
          </div>
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
            {watched && (
              <Eye className="h-4 w-4 text-blue-400" />
            )}
          </div>
        </div>
      </div>
    </Link>
  );
});
