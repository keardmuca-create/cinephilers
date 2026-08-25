"use client"

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Movie, CollectionItem } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { ChevronLeft, Film } from 'lucide-react';
import { WatchedEye } from '@/components/watched-eye';

function CollectionRow({ part }: { part: CollectionItem }) {
  const isWatched = typeof window !== 'undefined' && localStorage.getItem(`watched-${part.id}`) === 'true';
  const ratingRaw = typeof window !== 'undefined' ? localStorage.getItem(`movie-rating-${part.id}`) : null;
  const userRating = ratingRaw ? Number(ratingRaw) : undefined;
  const isUpcoming = part.releaseDate ? new Date(part.releaseDate).getTime() > Date.now() : false;
  const comingLabel = isUpcoming && part.releaseDate
    ? new Date(part.releaseDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : '';

  const inner = (
    <>
      {/* Thumbnail */}
      <div className={`relative w-16 aspect-[2/3] overflow-hidden rounded-lg bg-muted shadow-md shrink-0 ${part.isCurrent ? 'ring-2 ring-primary' : ''}`}>
        {part.poster ? (
          <img
            src={part.poster}
            alt={part.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted">
            <Film className="h-7 w-7 text-primary/60" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold font-headline line-clamp-2 group-hover:text-primary transition-colors leading-snug mb-0.5">
          {part.title}
        </h3>
        <p className="text-xs text-muted-foreground mb-1.5">{part.year}</p>
        <div className="flex items-center gap-2.5 flex-wrap">
          {userRating !== undefined && (
            <div className="flex items-center gap-0.5">
              <span className="text-xs text-primary font-bold">☆</span>
              <span className="text-xs font-bold text-primary">{userRating}</span>
            </div>
          )}
          {isUpcoming ? (
            <span className="text-xs font-semibold text-amber-500">Coming {comingLabel}</span>
          ) : isWatched ? (
            <div className="flex items-center gap-1 text-primary">
              <WatchedEye state="complete" className="h-3.5 w-3.5" />
              <span className="text-xs font-semibold">Watched</span>
            </div>
          ) : null}
          {part.isCurrent && (
            <span className="text-xs font-bold text-primary">You&apos;re here</span>
          )}
        </div>
      </div>
    </>
  );

  if (part.isCurrent) {
    return <div className="group relative flex items-center gap-4 py-3.5">{inner}</div>;
  }
  return (
    <Link href={`/movie/${part.id}`} className="group relative flex items-center gap-4 py-3.5">{inner}</Link>
  );
}

export default function CollectionPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [movie, setMovie] = useState<Movie | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/movies/${id}`)
      .then(r => r.json())
      .then((data: Movie & { error?: string }) => {
        if (!data.error) setMovie(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const collection = movie?.collection;

  return (
    <main className="pb-32">
      {/* Header */}
      <div className="px-6 pt-[calc(env(safe-area-inset-top)+3rem)] pb-4 flex items-center gap-3">
        <Button variant="ghost" size="icon" className="rounded-full shrink-0 -ml-2" onClick={() => router.back()}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <h1 className="text-3xl font-headline font-bold mb-0.5 truncate">{collection?.name ?? 'Collection'}</h1>
          {collection && (
            <p className="text-muted-foreground text-sm">
              {collection.parts.length} Film{collection.parts.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="px-6">
          <div className="divide-y divide-border">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 py-3.5">
                <div className="w-16 aspect-[2/3] bg-muted rounded-lg animate-pulse shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded animate-pulse w-2/3" />
                  <div className="h-3 bg-muted rounded animate-pulse w-1/3" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : collection ? (
        <div className="px-6">
          <div className="divide-y divide-border">
            {collection.parts.map(part => (
              <CollectionRow key={part.id} part={part} />
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground px-6">No collection found for this film.</p>
      )}
    </main>
  );
}
