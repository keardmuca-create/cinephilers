"use client"

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Clock, Star } from 'lucide-react';

interface RecentItem {
  id: string;
  title: string;
  poster: string;
  year: string;
  type: string;
  rating?: number;
}

export function RecentlyViewed() {
  const [items, setItems] = useState<RecentItem[]>([]);
  const [userRatings, setUserRatings] = useState<Record<string, number>>({});

  useEffect(() => {
    try {
      const stored = localStorage.getItem('recently-viewed');
      if (stored) {
        const parsed: RecentItem[] = JSON.parse(stored);
        const slice = parsed.slice(0, 25);
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

  if (items.length === 0) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3 px-6">
        <div className="w-1 h-5 bg-primary rounded-full" />
        <h2 className="text-xl font-headline font-bold flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" /> Recently Viewed
        </h2>
      </div>
      <div className="flex overflow-x-auto gap-4 px-6 pb-4 no-scrollbar">
        {items.map(item => {
          const userRating = userRatings[item.id];
          return (
            <Link key={item.id} href={`/movie/${item.id}`} className="block shrink-0 group">
              <div className="w-44 flex flex-col">
                <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-muted shadow-lg movie-card-hover mb-2.5">
                  <Image
                    src={item.poster}
                    alt={item.title}
                    fill
                    className="object-cover transition-transform group-hover:scale-110"
                    sizes="176px"
                  />
                  <div className="absolute bottom-2 left-2">
                    <span className="text-[9px] font-bold uppercase tracking-wider bg-black/60 backdrop-blur-sm text-white/80 px-2 py-0.5 rounded-full border border-white/10">
                      {item.type === 'show' ? 'TV' : 'Film'}
                    </span>
                  </div>
                </div>
                <div className="space-y-0.5 px-0.5">
                  <div className="flex items-start justify-between gap-1">
                    <h3 className="text-sm font-semibold font-headline line-clamp-2 group-hover:text-primary transition-colors leading-snug flex-1 min-w-0">
                      {item.title}
                    </h3>
                    <div className="flex flex-col items-end gap-0.5 shrink-0">
                      {item.rating && (
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
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground">{item.year}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
