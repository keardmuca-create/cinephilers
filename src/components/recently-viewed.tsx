"use client"

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Clock, Star, Eye, ChevronRight } from 'lucide-react';

interface RecentItem {
  id: string;
  title: string;
  poster: string;
  year: string;
  type: string;
  rating?: number;
  watched?: boolean;
}

export function RecentlyViewed() {
  const [items, setItems] = useState<RecentItem[]>([]);
  const [userRatings, setUserRatings] = useState<Record<string, number>>({});

  useEffect(() => {
    try {
      const stored = localStorage.getItem('recently-viewed');
      if (stored) {
        const parsed: RecentItem[] = JSON.parse(stored);
        const slice = parsed.slice(0, 25).map(item => ({
          ...item,
          watched: localStorage.getItem(`watched-${item.id}`) === 'true',
        }));
        setItems(slice);
        const ratings: Record<string, number> = {};
        for (const item of slice) {
          const r = localStorage.getItem(`movie-rating-${item.id}`);
          if (r) ratings[item.id] = parseInt(r, 10);
        }
        setUserRatings(ratings);
      }
    } catch { /* ignore */ }

    const onStorage = (e: StorageEvent) => {
      if (e.key === 'recently-viewed' && e.newValue) {
        try {
          const slice = (JSON.parse(e.newValue) as RecentItem[]).slice(0, 25);
          setItems(slice);
        } catch { /* ignore */ }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

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
          return (
            <Link key={item.id} href={`/movie/${item.id}`} className="block shrink-0 group">
              <div className="w-36 flex flex-col">
                <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-muted shadow-lg movie-card-hover mb-2.5">
                  <Image
                    src={item.poster}
                    alt={item.title}
                    fill
                    className="object-cover"
                    sizes="176px"
                  />
                </div>
                <div className="space-y-0.5 px-0.5">
                  <div className="flex items-start justify-between gap-1">
                    <h3 className="text-sm font-semibold font-headline line-clamp-2 group-hover:text-primary transition-colors leading-snug flex-1 min-w-0">
                      {item.title}
                    </h3>
                    <div className="flex flex-col items-end gap-0.5 shrink-0">
                      {/* `> 0`, not just truthiness: a rating of 0 makes
                          `item.rating && …` evaluate to the number 0, which React
                          renders as a literal "0" beside the title. */}
                      {item.rating != null && item.rating > 0 && (
                        <div className="flex items-center gap-0.5">
                          <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                          <span className="text-xs font-bold text-foreground">{item.rating.toFixed(1)}</span>
                        </div>
                      )}
                      {userRating !== undefined && (
                        <div className="flex items-center gap-0.5">
                          <Star className="h-3 w-3 fill-blue-400 text-blue-400" />
                          <span className="text-[10px] font-bold text-blue-400">{userRating}</span>
                        </div>
                      )}
                      {item.watched && (
                        <Eye className="h-3.5 w-3.5 text-blue-400" />
                      )}
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground">{item.year}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
      )}
    </section>
  );
}
