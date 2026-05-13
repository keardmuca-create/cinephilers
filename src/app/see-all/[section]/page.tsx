"use client"

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Movie } from '@/lib/types';
import { Star, ChevronLeft, Tv, Film } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

const SECTION_TITLES: Record<string, string> = {
  featured: 'Featured Today',
  'popular-movies': 'Popular Movies',
  'popular-shows': 'Popular TV Shows',
};

function ListItemSkeleton() {
  return (
    <div className="flex gap-4 px-6 py-4 border-b border-white/5">
      <Skeleton className="w-16 rounded-xl shrink-0" style={{ aspectRatio: '2/3' }} />
      <div className="flex-1 space-y-2 py-1">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-1/4" />
      </div>
    </div>
  );
}

function MovieListItem({ movie, index }: { movie: Movie; index: number }) {
  const isShow = movie.type === 'show';
  const typeLabel = isShow
    ? (movie.showType === 'Miniseries' ? 'Mini Series' : 'TV Series')
    : 'Movie';

  return (
    <Link
      href={`/movie/${movie.id}`}
      className="flex items-center gap-4 px-6 py-4 border-b border-white/5 hover:bg-white/5 transition-colors active:bg-white/10"
    >
      <span className="text-2xl font-black font-headline text-white/20 w-8 shrink-0 text-right">
        {index + 1}
      </span>
      <div className="relative w-14 shrink-0 rounded-xl overflow-hidden shadow-lg" style={{ aspectRatio: '2/3' }}>
        <Image
          src={movie.poster}
          alt={movie.title}
          fill
          className="object-cover"
          sizes="56px"
        />
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <h3 className="font-bold font-headline text-sm leading-snug line-clamp-2">
          {movie.title}
        </h3>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs font-bold text-muted-foreground">
          <span>{movie.year}</span>
          <span className="flex items-center gap-0.5 text-accent">
            <Star className="h-3 w-3 fill-current" />
            {movie.rating.toFixed(1)}
          </span>
          {isShow ? (
            <>
              <span className="flex items-center gap-1 text-primary">
                <Tv className="h-3 w-3" />
                {typeLabel}
              </span>
              {movie.totalEpisodes != null && (
                <span>{movie.totalEpisodes} episodes</span>
              )}
            </>
          ) : (
            <span className="flex items-center gap-1 text-primary">
              <Film className="h-3 w-3" />
              Movie
            </span>
          )}
        </div>
        {movie.genre && (
          <p className="text-[10px] text-muted-foreground/60 font-medium line-clamp-1">
            {movie.genre}
          </p>
        )}
      </div>
    </Link>
  );
}

export default function SeeAllPage() {
  const { section } = useParams<{ section: string }>();
  const router = useRouter();
  const [items, setItems] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const title = SECTION_TITLES[section] ?? 'All Titles';

  useEffect(() => {
    if (!section) return;
    setLoading(true);
    setError(false);
    fetch(`/api/see-all/${section}`)
      .then(r => r.json())
      .then((json: { items?: Movie[]; error?: string }) => {
        if (json.items) setItems(json.items);
        else setError(true);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [section]);

  return (
    <main className="min-h-screen pb-20 bg-background">
      <header className="sticky top-0 z-10 bg-background/90 backdrop-blur-xl border-b border-white/5 px-4 py-4 flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full shrink-0"
          onClick={() => router.back()}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-headline font-bold truncate">{title}</h1>
        {!loading && !error && (
          <span className="text-sm text-muted-foreground ml-auto shrink-0">
            {items.length} titles
          </span>
        )}
      </header>

      {error ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <p className="text-muted-foreground font-bold">Failed to load titles.</p>
          <Button variant="outline" className="rounded-full border-white/10" onClick={() => router.back()}>
            Go Back
          </Button>
        </div>
      ) : loading ? (
        <div className="divide-y divide-white/5">
          {Array(15).fill(0).map((_, i) => <ListItemSkeleton key={i} />)}
        </div>
      ) : (
        <div>
          {items.map((movie, i) => (
            <MovieListItem key={movie.id} movie={movie} index={i} />
          ))}
        </div>
      )}
    </main>
  );
}
