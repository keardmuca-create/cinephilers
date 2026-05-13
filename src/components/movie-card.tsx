
"use client"

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Star, BookmarkPlus, Check } from 'lucide-react';
import { Movie } from '@/lib/types';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

interface MovieCardProps {
  movie: Movie;
  className?: string;
  horizontal?: boolean;
}

export const MovieCard: React.FC<MovieCardProps> = ({ movie, className, horizontal = false }) => {
  const [saved, setSaved] = useState(false);

  const handleSave = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSaved(prev => !prev);
    toast({ title: saved ? 'Removed from watchlist' : 'Added to watchlist' });
  };

  const primaryGenre = movie.genre.split(' ')[0];

  return (
    <Link href={`/movie/${movie.id}`} className={cn("block shrink-0", className)}>
      <div className={cn(
        "group flex flex-col",
        horizontal ? "w-40" : "w-44"
      )}>
        <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-muted shadow-lg movie-card-hover mb-3">
          <Image
            src={movie.poster}
            alt={movie.title}
            fill
            className="object-cover transition-transform group-hover:scale-110"
            sizes="(max-width: 768px) 160px, 200px"
          />
          {/* Quick-save button */}
          <button
            onClick={handleSave}
            className={cn(
              "absolute top-2 right-2 h-8 w-8 rounded-full flex items-center justify-center transition-all duration-200",
              "opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0",
              saved
                ? "bg-primary text-white"
                : "bg-black/60 backdrop-blur-sm text-white hover:bg-primary"
            )}
          >
            {saved
              ? <Check className="h-4 w-4" />
              : <BookmarkPlus className="h-4 w-4" />
            }
          </button>

          {/* Genre badge */}
          <div className="absolute bottom-2 left-2">
            <span className="text-[9px] font-bold uppercase tracking-wider bg-black/60 backdrop-blur-sm text-white/80 px-2 py-0.5 rounded-full border border-white/10">
              {primaryGenre}
            </span>
          </div>
        </div>

        <div className="space-y-1 px-1">
          <div className="flex items-start justify-between gap-1">
            <h3 className="text-sm font-semibold font-headline line-clamp-2 group-hover:text-primary transition-colors leading-snug">
              {movie.title}
            </h3>
            <div className="flex items-center gap-0.5 shrink-0 text-accent">
              <Star className="h-3 w-3 fill-current" />
              <span className="text-xs font-bold">{movie.rating.toFixed(1)}</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground line-clamp-1">
            {movie.year}
          </p>
        </div>
      </div>
    </Link>
  );
};
