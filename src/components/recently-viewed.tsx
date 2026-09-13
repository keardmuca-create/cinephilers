"use client"

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Clock, ChevronRight, User } from 'lucide-react';
import { WatchedEye } from '@/components/watched-eye';
import { PosterCard, ScoreStar, UserScore } from '@/components/poster-card';
import { readWatchedState, type WatchedState } from '@/lib/watched-state';
import { readUserRating } from '@/lib/library-store';
import { batchFetchMeta } from '@/lib/meta-batch';
import { batchFetchRatings, subscribeRatingCache } from '@/lib/rating-batch';
import { resolveDisplayRating } from '@/lib/cinephilers-rating';
import type { BatchRating } from '@/app/api/movies/ratings/route';

interface RecentItem {
  id: string;
  title: string;
  poster: string;
  year: string;
  type: string;
  rating?: number;
  watched?: WatchedState;
}

export function RecentlyViewed() {
  const [items, setItems] = useState<RecentItem[]>([]);
  const [userRatings, setUserRatings] = useState<Record<string, number>>({});
  // Live scores, fetched behind the stored snapshot. Keyed by id; a value of
  // null means "asked, and this title has no community score".
  const [cine, setCine] = useState<Record<string, BatchRating | null>>({});

  // The stored entry carries the rating that was true when the film was last
  // OPENED, which for a row called "recently viewed" can be weeks ago. Refresh
  // the number behind the snapshot: the row paints instantly from what it has,
  // then corrects itself — the same order the rest of the app paints in.
  const refreshRatings = useCallback((list: RecentItem[]) => {
    // People live in this row too, stored with a BARE tmdb id. Sending those to
    // a title endpoint canonicalises them into `tmdb-{id}` and returns whichever
    // film owns that number — the same collision the link below guards against.
    const ids = list.filter(i => i.id && i.type !== 'person').map(i => i.id);
    if (ids.length === 0) return;
    batchFetchRatings(ids).then(setCine).catch(() => { /* keep the snapshot */ });
    batchFetchMeta(ids)
      .then(metaMap => {
        setItems(prev => prev.map(item => {
          const m = metaMap[item.id];
          return m && typeof m.tmdbRating === 'number' ? { ...item, rating: m.tmdbRating } : item;
        }));
      })
      .catch(() => { /* keep the snapshot */ });
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('recently-viewed');
      if (stored) {
        const parsed: RecentItem[] = JSON.parse(stored);
        const slice = parsed.slice(0, 25).map(item => ({
          ...item,
          watched: readWatchedState(item.id),
        }));
        setItems(slice);
        refreshRatings(slice);
        const ratings: Record<string, number> = {};
        for (const item of slice) {
          const r = readUserRating(item.id);
          if (r) ratings[item.id] = r;
        }
        setUserRatings(ratings);
      }
    } catch { /* ignore */ }

    const onStorage = (e: StorageEvent) => {
      if (e.key === 'recently-viewed' && e.newValue) {
        try {
          // Recompute the eye here too — the stored list doesn't carry it, so
          // reusing the raw entries dropped every eye when another tab wrote.
          const slice = (JSON.parse(e.newValue) as RecentItem[]).slice(0, 25)
            .map(item => ({ ...item, watched: readWatchedState(item.id) }));
          setItems(slice);
          refreshRatings(slice);
        } catch { /* ignore */ }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [refreshRatings]);

  useEffect(() => {
    const handler = (e: Event) => {
      const { id, rating } = (e as CustomEvent<{ id: string; rating: number | null }>).detail;
      setUserRatings(prev => {
        if (rating === null) {
          const next = { ...prev };
          delete next[id];
          return next;
        }
        return { ...prev, [id]: rating };
      });
    };
    window.addEventListener('cinephilers-rating-changed', handler);
    return () => window.removeEventListener('cinephilers-rating-changed', handler);
  }, []);

  // Your own number above reacts to the event; the community score under the
  // poster did not, because it is only ever fetched when this component mounts —
  // and installed as a PWA this component mounts once and then lives for days.
  // This row asks again whenever the cache says the answer has moved.
  useEffect(() => subscribeRatingCache(() => refreshRatings(items)), [items, refreshRatings]);

  // The section stays put even with nothing in it. A row that appears out of
  // nowhere after the first tap makes the home screen jump; and an empty section
  // that explains itself teaches what the row is for, which a missing one cannot.
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <div className="w-1 h-5 bg-primary rounded-full" />
          <h2 className="text-xl font-headline font-bold flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" /> Recently Viewed
          </h2>
        </div>
        <Link href="/recently-viewed" className="text-xs text-primary border border-primary/30 rounded-full px-3 py-1 hover:bg-primary/10 transition-colors font-semibold flex items-center gap-1 shrink-0">
          See All <ChevronRight className="h-3 w-3" />
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="px-6 text-sm text-muted-foreground">
          Nothing yet — films and shows you open will show up here.
        </p>
      ) : (
      <div className="flex overflow-x-auto gap-4 px-6 pb-4 no-scrollbar">
        {items.map(item => {
          const userRating = userRatings[item.id];
          // One rule for the whole app: past the vote threshold a title shows
          // what this community made of it, everywhere it appears — not the
          // community score on its own page and TMDB's everywhere else.
          const shown = resolveDisplayRating(item.rating, cine[item.id]);
          return (
            // People are stored here too — the person page adds itself with
            // type 'person' and a BARE tmdb id. Sending those to /movie/{id}
            // canonicalised them into `tmdb-{id}` and opened whichever film owns
            // that number: tapping Johnny Depp (85) opened Raiders of the Lost
            // Ark. Same id space, different thing.
            // The shared card: scores in the row above the title, which keeps its
            // full width. (A person with no photo stores an empty string; the card
            // only draws an image when there is one.)
            <PosterCard
              key={item.id}
              href={item.type === 'person' ? `/person/${item.id}` : `/movie/${item.id}`}
              poster={item.poster}
              title={item.title}
              secondLine={item.year}
              fallbackIcon={item.type === 'person' ? <User className="h-9 w-9 text-muted-foreground/50" /> : undefined}
              badges={<>
                {/* resolveDisplayRating returns null rather than 0 when there is
                    nothing to show, so the star is left off instead of a literal
                    "0" appearing on the card. */}
                {shown && <ScoreStar value={shown.value} source={shown.source} />}
                {userRating !== undefined && <UserScore value={userRating} />}
                {item.watched && item.watched !== 'none' && (
                  <WatchedEye state={item.watched} className="h-3.5 w-3.5" />
                )}
              </>}
            />
          );
        })}
      </div>
      )}
    </section>
  );
}
