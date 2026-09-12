"use client"

import React from 'react';
import Link from 'next/link';
import { Film } from 'lucide-react';
import { cn } from '@/lib/utils';

// The one card every row of titles uses — Home, Browse, Recently viewed and the
// profile shelves. Keard picked the design on 2026-09-12 from a side-by-side mockup
// ("B"): a soft panel behind each card, the scores ABOVE the title (where the
// profile had them; Home had them squeezed in beside it), the title held to two
// lines, and one fixed line under it for the year — or the episode, on an episode
// card.
//
// Every line keeps its height whether or not it has anything in it, so a row of
// cards lines up: a long title, a missing score or an absent year no longer makes
// one card taller than the next. The year never hides to make room — it is what
// tells Dune (1984) from Dune (2021).
export function PosterCard({
  href,
  poster,
  title,
  secondLine,
  badges,
  overlay,
  fallbackIcon,
  className,
}: {
  href: string;
  poster?: string | null;
  title: string;
  /** The year, or the episode line on an episode card. */
  secondLine?: React.ReactNode;
  /** Scores and the watched eye, in the row above the title. */
  badges?: React.ReactNode;
  /** Drawn over the poster: a Top 10 rank, a rewatch count. */
  overlay?: React.ReactNode;
  /** Shown when there's no poster. Defaults to a film icon. */
  fallbackIcon?: React.ReactNode;
  className?: string;
}) {
  return (
    <Link href={href} className={cn('group block shrink-0 w-36', className)}>
      <div className="h-full rounded-2xl bg-muted/60 p-1.5 pb-2.5">
        <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-muted movie-card-hover flex items-center justify-center">
          {poster ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={poster} alt={title} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            fallbackIcon ?? <Film className="h-9 w-9 text-primary/60" />
          )}
          {overlay}
        </div>
        <div className="px-1 pt-2">
          <div className="flex h-4 items-center gap-1.5 overflow-hidden">{badges}</div>
          <h3 className="mt-1 min-h-[2.0625rem] text-xs font-semibold font-headline leading-snug line-clamp-2 transition-colors group-hover:text-primary">
            {title}
          </h3>
          <p className="mt-0.5 min-h-[1rem] text-[11px] leading-4 text-muted-foreground line-clamp-1">{secondLine}</p>
        </div>
      </div>
    </Link>
  );
}

/**
 * A title's public score, already resolved. Looks exactly like CommunityStar, which
 * does the resolving itself: primary when this community decided it, yellow when
 * TMDB did.
 */
export function ScoreStar({ value, source }: { value: number; source: string }) {
  return (
    <div className="flex items-center gap-0.5">
      <span className={cn('text-xs font-bold', source === 'cinephilers' ? 'text-primary' : 'text-yellow-400')}>★</span>
      <span className="text-xs font-bold text-foreground">{value.toFixed(1)}</span>
    </div>
  );
}

/** Your own score for the title. */
export function UserScore({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-0.5">
      <span className="text-xs text-primary font-bold">☆</span>
      <span className="text-xs font-bold text-primary">{value}</span>
    </div>
  );
}
