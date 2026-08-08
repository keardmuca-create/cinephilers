"use client"

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Movie, Actor } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronLeft, ChevronRight, User } from 'lucide-react';

// The same 144×216 portrait the title page uses for its cast row, in a list. Big
// enough to actually recognise a face — the old 40px square was a favicon.
function CreditRow({ href, photo, name, detail }: {
  href: string;
  photo?: string;
  name: string;
  detail: string;
}) {
  return (
    <Link
      href={href}
      className="w-full flex items-center gap-4 px-2 py-2 rounded-2xl hover:bg-muted/40 transition-colors"
    >
      <div className="relative w-24 aspect-[2/3] rounded-xl overflow-hidden shrink-0 bg-muted flex items-center justify-center">
        {photo ? (
          <Image src={photo} alt={name} fill className="object-cover" sizes="96px" />
        ) : (
          <User className="h-8 w-8 text-muted-foreground/40" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-base font-semibold font-headline leading-snug line-clamp-2">{name}</p>
        <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">{detail}</p>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </Link>
  );
}

// Rows are tall now, so a long-running series (King of the Hill lists 384 people)
// would otherwise render as an unbroken half-mile of page. Batching keeps the
// first screen instant and lets someone stop whenever they have found who they
// came for.
const CAST_BATCH = 30;

export default function CastCrewPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [movie, setMovie] = useState<Movie | null>(null);
  const [fullCast, setFullCast] = useState<Actor[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [shown, setShown] = useState(CAST_BATCH);

  // Two requests on purpose. The title payload carries the twenty names its own
  // page draws; the complete list — every guest star across a series, hundreds of
  // people on a long-running show — is fetched only here, where it is actually
  // read. Both are cached, and this page is opened rarely.
  useEffect(() => {
    fetch(`/api/movies/${id}`)
      .then(r => r.json())
      .then((data: Movie & { error?: string }) => {
        if (!data.error) setMovie(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    fetch(`/api/movies/${id}/cast`)
      .then(r => r.ok ? r.json() : null)
      .then((data: Actor[] | null) => { if (Array.isArray(data)) setFullCast(data); })
      .catch(() => { /* falls back to the title payload's twenty */ });
  }, [id]);

  const crew = (movie?.crew ?? []).filter(c => c.id);
  // The full list when it arrives, otherwise what the title payload already gave
  // us — a short cast beats an empty page if the second request fails.
  const cast = fullCast ?? movie?.cast ?? [];

  return (
    <main className="max-w-xl mx-auto px-4 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-32 space-y-6">
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
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-2">
              <Skeleton className="w-24 aspect-[2/3] rounded-xl shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3.5 w-24" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && movie && (
        <div>
          {cast.length > 0 && (
            <>
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground px-2 mb-2">
                Cast <span className="opacity-60">{cast.length}</span>
              </p>
              <div className="space-y-1">
                {cast.slice(0, shown).map(actor => (
                  <CreditRow
                    key={actor.id}
                    href={`/person/${actor.id}`}
                    photo={actor.profileImage}
                    name={actor.name}
                    detail={actor.role}
                  />
                ))}
              </div>
              {cast.length > shown && (
                <Button
                  variant="outline"
                  className="w-full rounded-xl mt-3 font-bold border-border"
                  onClick={() => setShown(n => n + CAST_BATCH)}
                >
                  Show {Math.min(CAST_BATCH, cast.length - shown)} more
                </Button>
              )}
            </>
          )}
          {crew.length > 0 && (
            <div className="mt-6">
              <Separator className="mb-4" />
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground px-2 mb-2">Crew</p>
              <div className="space-y-1">
                {crew.map(member => (
                  <CreditRow
                    key={`${member.id}-${member.job}`}
                    href={`/person/${member.id}`}
                    photo={member.profileImage}
                    name={member.name}
                    detail={member.job}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
