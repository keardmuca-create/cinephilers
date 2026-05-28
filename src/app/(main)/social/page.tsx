"use client"

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Heart, Star, Eye, Bookmark, Film, User } from 'lucide-react';
import { ActivityEntry, getFeed, toggleLike, relativeTime } from '@/lib/activity';

function actionLabel(action: ActivityEntry['action']) {
  if (action === 'watched') return 'watched';
  if (action === 'rated') return 'rated';
  return 'added to watchlist';
}

function ActionIcon({ action }: { action: ActivityEntry['action'] }) {
  if (action === 'watched') return <Eye className="h-3.5 w-3.5 text-blue-400" />;
  if (action === 'rated') return <Star className="h-3.5 w-3.5 text-yellow-400" />;
  return <Bookmark className="h-3.5 w-3.5 text-primary" />;
}

function ActivityCard({ entry, onLike }: { entry: ActivityEntry; onLike: (id: string) => void }) {
  const liked = entry.likes.includes('me');

  return (
    <div className="bg-card rounded-3xl border border-white/5 shadow-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-5 pb-3">
        <div className="h-10 w-10 rounded-2xl bg-primary/20 flex items-center justify-center shrink-0">
          <User className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold font-headline">You</p>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ActionIcon action={entry.action} />
            <span>{actionLabel(entry.action)}</span>
            <span>·</span>
            <span>{relativeTime(entry.timestamp)}</span>
          </div>
        </div>
      </div>

      {/* Movie card */}
      <Link href={`/movie/${entry.contentId}`} className="block mx-5 mb-4 group">
        <div className="bg-muted/40 rounded-2xl p-3.5 flex gap-4 hover:bg-muted/70 transition-colors border border-white/5">
          <div className="relative w-16 shrink-0 rounded-xl overflow-hidden shadow-md bg-muted" style={{ aspectRatio: '2/3' }}>
            {entry.contentPoster ? (
              <Image src={entry.contentPoster} alt={entry.contentTitle} fill className="object-cover" sizes="64px" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Film className="h-6 w-6 text-muted-foreground/40" />
              </div>
            )}
          </div>
          <div className="flex flex-col justify-center gap-1.5 flex-1 min-w-0">
            <h3 className="font-bold font-headline text-base group-hover:text-primary transition-colors line-clamp-2 leading-snug">
              {entry.contentTitle}
            </h3>
            {entry.contentYear && (
              <p className="text-xs text-muted-foreground">{entry.contentYear}</p>
            )}
            {entry.action === 'rated' && entry.rating !== undefined && (
              <div className="flex items-center gap-1 text-yellow-400 font-bold text-sm bg-yellow-400/10 w-fit px-2.5 py-0.5 rounded-full">
                <Star className="h-3.5 w-3.5 fill-current" />
                {entry.rating} / 10
              </div>
            )}
          </div>
        </div>
      </Link>

      {/* Like */}
      <div className="px-5 pb-4 flex items-center gap-2">
        <button
          onClick={() => onLike(entry.id)}
          className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-primary transition-colors"
        >
          <Heart className={`h-5 w-5 transition-colors ${liked ? 'fill-primary text-primary' : ''}`} />
          {entry.likes.length > 0 && <span>{entry.likes.length}</span>}
        </button>
      </div>
    </div>
  );
}

export default function SocialPage() {
  const [feed, setFeed] = useState<ActivityEntry[]>([]);

  useEffect(() => {
    setFeed(getFeed());
    const handler = () => setFeed(getFeed());
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const handleLike = (id: string) => {
    setFeed(toggleLike(id));
  };

  return (
    <main className="max-w-xl mx-auto px-4 pt-10 pb-20 space-y-6">
      <h1 className="text-3xl font-headline font-bold px-2">Activity</h1>

      {feed.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <div className="h-16 w-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
            <Eye className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <p className="font-bold font-headline text-lg">No activity yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Watch, rate, or save a movie to see it here
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {feed.map(entry => (
            <ActivityCard key={entry.id} entry={entry} onLike={handleLike} />
          ))}
        </div>
      )}
    </main>
  );
}
