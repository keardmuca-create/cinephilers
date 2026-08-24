"use client"

import React from 'react';
import { useCommunityRatings } from '@/hooks/use-community-ratings';
import { resolveDisplayRating } from '@/lib/cinephilers-rating';
import { cn } from '@/lib/utils';

/**
 * A title's score — the community's once it has enough votes, TMDB's until then.
 *
 * Exists because several of these stars are rendered inside a .map(), where a
 * hook cannot go. Owning the hook itself means each of those places is one
 * element rather than its own copy of the rule.
 *
 * Colour carries the source: the primary colour means this community decided it,
 * yellow means TMDB did.
 */
export function CommunityStar({
  id,
  tmdbRating,
  className,
  showZero = false,
}: {
  id: string;
  tmdbRating: number | null | undefined;
  className?: string;
  /**
   * Print "0.0" for a title that genuinely has no votes rather than leaving the
   * star off. Some lists want the difference between "nobody rated it" and "this
   * is broken" to be visible; most would rather show nothing.
   */
  showZero?: boolean;
}) {
  const cine = useCommunityRatings([id]);
  const shown = resolveDisplayRating(tmdbRating, cine[id]);

  if (!shown) {
    if (!showZero || tmdbRating === null || tmdbRating === undefined) return null;
    return (
      <div className={cn('flex items-center gap-0.5', className)}>
        <span className="text-xs text-yellow-400 font-bold">★</span>
        <span className="text-xs font-bold text-foreground">{tmdbRating.toFixed(1)}</span>
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-0.5', className)}>
      <span className={cn('text-xs font-bold', shown.source === 'cinephilers' ? 'text-primary' : 'text-yellow-400')}>★</span>
      <span className="text-xs font-bold text-foreground">{shown.value.toFixed(1)}</span>
    </div>
  );
}
