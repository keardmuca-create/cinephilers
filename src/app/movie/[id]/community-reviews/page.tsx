"use client"

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Movie } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronLeft, Star } from 'lucide-react';

export default function CommunityReviewsPage() {
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

  const reviews = movie?.reviews ?? [];

  return (
    <main className="max-w-xl mx-auto px-4 pt-6 pb-32 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="rounded-full shrink-0" onClick={() => router.back()}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <h1 className="text-2xl font-headline font-bold">Community Reviews</h1>
          {movie && <p className="text-sm text-muted-foreground truncate">{movie.title}</p>}
        </div>
      </div>

      {loading && (
        <div className="space-y-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-9 w-9 rounded-full shrink-0" />
                <Skeleton className="h-3.5 w-32" />
              </div>
              <Skeleton className="h-16 w-full rounded-xl" />
            </div>
          ))}
        </div>
      )}

      {!loading && reviews.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-16">No community reviews yet.</p>
      )}

      {!loading && reviews.length > 0 && (
        <div className="space-y-6">
          {reviews.map(r => (
            <div key={r.id} className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={r.userAvatar} />
                    <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">{r.userName.charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div>
                    <span className="text-sm font-bold font-headline block">{r.userName}</span>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">{r.date}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 bg-yellow-400/10 text-yellow-500 px-3 py-1 rounded-full text-xs font-black">
                  <Star className="h-3 w-3 fill-current" /> {r.rating}
                </div>
              </div>
              <p className="text-sm text-foreground leading-relaxed italic">&ldquo;{r.content}&rdquo;</p>
              <Separator />
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
