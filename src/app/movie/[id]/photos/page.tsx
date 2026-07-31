"use client"

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { Movie } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronLeft } from 'lucide-react';

export default function PhotosPage() {
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

  const images = movie?.images ?? [];

  return (
    <main className="max-w-4xl mx-auto px-4 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-32 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="rounded-full shrink-0" onClick={() => router.back()}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <h1 className="text-2xl font-headline font-bold">Photos</h1>
          {movie && <p className="text-sm text-muted-foreground truncate">{movie.title}</p>}
        </div>
      </div>

      {loading && (
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="aspect-video rounded-xl" />
          ))}
        </div>
      )}

      {!loading && images.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-16">No photos available.</p>
      )}

      {!loading && images.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {images.map((url, i) => (
            <div key={i} className="relative aspect-video rounded-xl overflow-hidden">
              <Image src={url} alt="" fill className="object-cover" />
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
