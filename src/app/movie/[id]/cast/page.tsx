"use client"

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Movie } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronLeft, ChevronRight, Film, User } from 'lucide-react';

export default function CastCrewPage() {
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

  const crew = (movie?.crew ?? []).filter(c => c.id);

  return (
    <main className="max-w-xl mx-auto px-4 pt-6 pb-32 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="rounded-full shrink-0" onClick={() => router.back()}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <h1 className="text-2xl font-headline font-bold">Cast &amp; Crew</h1>
          {movie && <p className="text-sm text-muted-foreground truncate">{movie.title}</p>}
        </div>
      </div>

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-2">
              <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && movie && (
        <div>
          {movie.cast.length > 0 && (
            <>
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground px-2 mb-2">Cast</p>
              <div className="space-y-0.5">
                {movie.cast.map(actor => (
                  <Link
                    key={actor.id}
                    href={`/person/${actor.id}`}
                    className="w-full flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-muted/40 transition-colors"
                  >
                    <div className="relative h-10 w-10 rounded-xl overflow-hidden shrink-0 bg-muted flex items-center justify-center">
                      {actor.profileImage ? (
                        <Image src={actor.profileImage} alt={actor.name} fill className="object-cover" />
                      ) : (
                        <User className="h-5 w-5 text-muted-foreground/50" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{actor.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{actor.role}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </Link>
                ))}
              </div>
            </>
          )}
          {crew.length > 0 && (
            <div className="mt-4">
              <Separator className="mb-4" />
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground px-2 mb-2">Crew</p>
              <div className="space-y-0.5">
                {crew.map(member => (
                  <Link
                    key={`${member.id}-${member.job}`}
                    href={`/person/${member.id}`}
                    className="w-full flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-muted/40 transition-colors"
                  >
                    <div className="h-10 w-10 rounded-xl bg-muted/50 flex items-center justify-center shrink-0">
                      <Film className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{member.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{member.job}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
