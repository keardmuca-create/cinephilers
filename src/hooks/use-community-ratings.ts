"use client"

import { useEffect, useState } from 'react';
import { batchFetchRatings } from '@/lib/rating-batch';
import { isEpisodeId } from '@/lib/media-id';
import type { BatchRating } from '@/app/api/movies/ratings/route';

/**
 * Community scores for a set of titles, so any surface can apply the same
 * threshold rule the film page applies.
 *
 * Safe to call per card. Requests made in the same tick are gathered into one
 * by the batcher underneath, so twenty posters asking separately is one request
 * — which is what lets a shared component like MovieCard use this without every
 * list having to collect ids on its behalf.
 *
 * Episodes are dropped here — votes live on the title, so an episode has no
 * aggregate of its own and asking for one is a wasted lookup.
 *
 * PEOPLE are the caller's job. A person is stored with a bare numeric id, and so
 * were films before the ids were canonicalised, so the two are indistinguishable
 * from the id alone — pass a person in and you get back the score of whichever
 * film owns that number. Callers holding a mixed list (recently viewed does)
 * must filter on their own type field before calling.
 */
export function useCommunityRatings(ids: (string | undefined | null)[]): Record<string, BatchRating | null> {
  // Depend on the CONTENT, not the array. A fresh array every render would
  // restart the effect every render.
  const key = [...new Set(ids.filter((id): id is string => !!id && !isEpisodeId(id)))].sort().join(',');
  const [ratings, setRatings] = useState<Record<string, BatchRating | null>>({});

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    batchFetchRatings(key.split(','))
      .then(map => { if (!cancelled) setRatings(map); })
      .catch(() => { /* the TMDB score stays on screen */ });
    return () => { cancelled = true; };
  }, [key]);

  return ratings;
}
