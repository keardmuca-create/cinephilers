"use client"

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Clock, Star, Search, X, Film, User } from 'lucide-react';

interface RecentItem {
  id: string;
  title: string;
  poster: string;
  year: string;
  type: string;
  rating?: number;
}

function ItemCard({ item, userRating }: { item: RecentItem; userRating?: number }) {
  return (
    // See the note in components/recently-viewed.tsx: a person is stored with a
    // bare tmdb id, and /movie/{id} would open the film that shares that number.
    <Link href={item.type === 'person' ? `/person/${item.id}` : `/movie/${item.id}`} className="group flex items-center gap-4 py-3.5">
      {/* Guarded: not everything here has a picture. A person with no photo on
          TMDB stores an empty string, and Next's Image treats that as a request
          to re-download the whole page. */}
      <div className="relative w-[4.5rem] aspect-[2/3] overflow-hidden rounded-lg bg-muted shadow-md shrink-0 flex items-center justify-center">
        {item.poster ? (
          <Image src={item.poster} alt={item.title} fill className="object-cover" sizes="72px" />
        ) : item.type === 'person' ? (
          <User className="h-6 w-6 text-muted-foreground/50" />
        ) : (
          <Film className="h-6 w-6 text-primary/60" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold font-headline line-clamp-2 group-hover:text-primary transition-colors leading-snug mb-0.5">
          {item.title}
        </h3>
        <p className="text-xs text-muted-foreground mb-1.5">{item.year}</p>
        <div className="flex items-center gap-2.5 flex-wrap">
          {item.rating !== undefined && item.rating > 0 && (
            <div className="flex items-center gap-0.5">
              <span className="text-xs text-yellow-400 font-bold">★</span>
              <span className="text-xs font-bold text-foreground">{item.rating.toFixed(1)}</span>
            </div>
          )}
          {userRating !== undefined && (
            <div className="flex items-center gap-0.5">
              <span className="text-xs text-blue-400 font-bold">★</span>
              <span className="text-xs font-bold text-blue-400">{userRating}</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

export default function RecentlyViewedPage() {
  const router = useRouter();
  const [items, setItems] = useState<RecentItem[]>([]);
  const [userRatings, setUserRatings] = useState<Record<string, number>>({});
  const [search, setSearch] = useState('');

  useEffect(() => {
    try {
      const stored = localStorage.getItem('recently-viewed');
      if (stored) {
        const parsed: RecentItem[] = JSON.parse(stored);
        setItems(parsed.slice(0, 100));
        const ratings: Record<string, number> = {};
        for (const item of parsed) {
          const r = localStorage.getItem(`movie-rating-${item.id}`);
          if (r) ratings[item.id] = parseInt(r, 10);
        }
        setUserRatings(ratings);
      }
    } catch { /* ignore */ }
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.trim().toLowerCase();
    return items.filter(i => i.title.toLowerCase().includes(q));
  }, [items, search]);

  return (
    <main className="pb-32">
      <div className="sticky top-[env(safe-area-inset-top)] z-10 bg-background/90 backdrop-blur-xl border-b border-border px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="rounded-full p-1 hover:bg-muted/60 transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-headline font-bold truncate flex-1">Recently Viewed</h1>
      </div>

      <div className="px-6 pt-4 pb-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input type="text" placeholder="Search recently viewed" value={search} onChange={e => setSearch(e.target.value)}
            className="w-full bg-muted border-2 border-primary/80 rounded-2xl pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors" />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="px-6 pb-4">
        <p className="text-xs text-muted-foreground">{filtered.length} title{filtered.length !== 1 ? 's' : ''}</p>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center px-6">
          <Clock className="h-12 w-12 text-muted-foreground/20" />
          <p className="text-muted-foreground text-sm">No recently viewed titles</p>
        </div>
      ) : (
        <div className="px-6 divide-y divide-border">
          {filtered.map(item => <ItemCard key={item.id} item={item} userRating={userRatings[item.id]} />)}
        </div>
      )}
    </main>
  );
}
