"use client"

import React, { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Movie } from '@/lib/types';
import { Star, ChevronLeft } from 'lucide-react';
import { WatchedEye } from '@/components/watched-eye';
import { readWatchedState, readEpisodeProgress, loadEpisodeProgress, type WatchedState } from '@/lib/watched-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

const SECTION_TITLES: Record<string, string> = {
  featured: 'Featured Today',
  'popular-movies': 'Popular Movies',
  'popular-shows': 'Popular TV Shows',
  'top-rated-movies': 'Top 100 Movies',
  'top-rated-shows': 'Top 100 TV Shows',
  'coming-soon': 'Coming Soon — Movies',
  'coming-soon-shows': 'Coming Soon — Shows',
  'top-picks-movies': 'Top Picks For You',
};

function getSectionTitle(section: string, titleParam: string | null): string {
  if (SECTION_TITLES[section]) return SECTION_TITLES[section];
  if (titleParam) return titleParam;
  if (section.startsWith('genre-')) return 'Genre Results';
  return 'All Titles';
}

function ListItemSkeleton() {
  return (
    <div className="flex gap-4 px-6 py-4 border-b border-border">
      <Skeleton className="w-20 rounded-xl shrink-0" style={{ aspectRatio: '2/3' }} />
      <div className="flex-1 space-y-2 py-1">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-1/4" />
      </div>
    </div>
  );
}

function MovieListItem({ movie }: { movie: Movie }) {
  const [userRating, setUserRating] = React.useState<number | undefined>();
  const [watched, setWatched] = React.useState<WatchedState>('none');
  const [progress, setProgress] = React.useState<string | null>(null);

  React.useEffect(() => {
    try {
      setWatched(readWatchedState(movie.id));
      const known = readEpisodeProgress(movie.id);
      setProgress(known);
      const r = localStorage.getItem(`movie-rating-${movie.id}`);
      if (r) setUserRating(Number(r));
      if (known) return;
    } catch { /* ignore */ }

    // Episode total wasn't cached — go and get it rather than fall back to a
    // bare count, which reads as a different kind of fact beside the fractions.
    let alive = true;
    loadEpisodeProgress(movie.id).then(p => { if (alive) setProgress(p); }).catch(() => { /* ignore */ });
    return () => { alive = false; };
  }, [movie.id]);

  return (
    <Link
      href={`/movie/${movie.id}`}
      className="group flex items-center gap-4 px-6 py-3.5 border-b border-border hover:bg-muted/40 transition-colors"
    >
      {/* 80px — the size Watch History uses, and now the one every full list in
          the app uses. See-all/{section}/page.tsx, this page, Recently Viewed,
          Rewatched and My Reviews had drifted to 72, 72, 64 and 56 respectively;
          a list is a list, and which one you happen to be looking at is not a
          reason for the artwork to change size. */}
      <div className="relative w-20 shrink-0 rounded-lg overflow-hidden shadow-sm bg-muted" style={{ aspectRatio: '2/3' }}>
        <Image src={movie.poster} alt={movie.title} fill className="object-cover" sizes="80px" />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold font-headline line-clamp-2 group-hover:text-primary transition-colors leading-snug mb-0.5">
          {movie.title}
        </h3>
        <p className="text-xs text-muted-foreground mb-1.5">{movie.year}</p>
        <div className="flex items-center gap-2.5 flex-wrap">
          {movie.rating > 0 && (
            <div className="flex items-center gap-0.5">
              <span className="text-xs text-yellow-400 font-bold">★</span>
              <span className="text-xs font-bold text-foreground">{movie.rating.toFixed(1)}</span>
            </div>
          )}
          {userRating !== undefined && (
            <div className="flex items-center gap-0.5">
              <span className="text-xs text-blue-400 font-bold">★</span>
              <span className="text-xs font-bold text-blue-400">{userRating}</span>
            </div>
          )}
          {watched !== 'none' && (
            // A row has room for the words a card can't spare. A part-watched
            // show gets the count, not "Watching" — someone who saw one episode
            // for a guest star isn't watching it, and the number says so.
            <div className="flex items-center gap-1 text-blue-400">
              <WatchedEye state={watched} className="h-3.5 w-3.5" />
              {/* The eye is right immediately; the fraction waits for the total
                  rather than showing a placeholder it will have to replace. */}
              {(watched === 'complete' || progress) && (
                <span className="text-xs font-semibold">
                  {watched === 'partial' ? progress : 'Watched'}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

export default function SeeAllPage() {
  const { section } = useParams<{ section: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [items, setItems] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const titleParam = searchParams.get('title');
  const title = getSectionTitle(section, titleParam);

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
      <header className="sticky top-0 z-10 bg-background/90 backdrop-blur-xl border-b border-border px-4 pb-4 pt-[calc(env(safe-area-inset-top)+1rem)] flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full shrink-0"
          onClick={() => router.back()}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-headline font-bold truncate">{title}</h1>
      </header>

      {error ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <p className="text-muted-foreground font-bold">Failed to load titles.</p>
          <Button variant="outline" className="rounded-full border-border" onClick={() => router.back()}>
            Go Back
          </Button>
        </div>
      ) : loading ? (
        <div className="divide-y divide-border">
          {Array(15).fill(0).map((_, i) => <ListItemSkeleton key={i} />)}
        </div>
      ) : (
        <div>
          {items.map(movie => (
            <MovieListItem key={movie.id} movie={movie} />
          ))}
        </div>
      )}
    </main>
  );
}
