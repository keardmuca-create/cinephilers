"use client"

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Clock } from 'lucide-react';

interface RecentItem {
  id: string;
  title: string;
  poster: string;
  year: string;
  type: string;
}

export function RecentlyViewed() {
  const [items, setItems] = useState<RecentItem[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('recently-viewed');
      if (stored) {
        const parsed: RecentItem[] = JSON.parse(stored);
        setItems(parsed.slice(0, 25));
      }
    } catch { /* ignore */ }

    const onStorage = (e: StorageEvent) => {
      if (e.key === 'recently-viewed' && e.newValue) {
        try {
          setItems((JSON.parse(e.newValue) as RecentItem[]).slice(0, 25));
        } catch { /* ignore */ }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
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
        {items.map(item => (
          <Link key={item.id} href={`/movie/${item.id}`} className="block shrink-0 group">
            <div className="w-32 flex flex-col">
              <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-muted shadow-lg movie-card-hover mb-2">
                <Image
                  src={item.poster}
                  alt={item.title}
                  fill
                  className="object-cover transition-transform group-hover:scale-110"
                  sizes="128px"
                />
                <div className="absolute bottom-2 left-2">
                  <span className="text-[9px] font-bold uppercase tracking-wider bg-black/60 backdrop-blur-sm text-white/80 px-2 py-0.5 rounded-full border border-white/10">
                    {item.type === 'show' ? 'TV' : 'Film'}
                  </span>
                </div>
              </div>
              <h3 className="text-xs font-semibold font-headline line-clamp-2 group-hover:text-primary transition-colors leading-snug px-0.5">
                {item.title}
              </h3>
              <p className="text-[10px] text-muted-foreground mt-0.5 px-0.5">{item.year}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
