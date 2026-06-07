"use client"

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Eye, MessageSquare, Star, Users, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/auth-context';
import { fetchWithAuth } from '@/lib/fetch-with-auth';

interface FriendRatingEntry {
  user: { id: string; username: string; displayName: string | null; avatarUrl: string | null };
  rating: number | null;
  watched: boolean;
  reviewed: boolean;
}

export default function MovieFriendsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user: authUser, loading: authLoading } = useAuth();

  const [entries, setEntries] = useState<FriendRatingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [movieTitle, setMovieTitle] = useState<string>('');

  useEffect(() => {
    if (!authUser) return;

    // Load movie title from cache
    try {
      const cached = localStorage.getItem(`meta-${id}`);
      if (cached) setMovieTitle(JSON.parse(cached).title ?? '');
    } catch { /* ignore */ }

    fetchWithAuth(`/api/movies/friends-ratings?tmdbId=${encodeURIComponent(id)}`)
      .then(r => r.ok ? r.json() : null)
      .then(json => { setEntries(json?.data ?? []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id, authUser]);

  if (!authLoading && !authUser) {
    router.replace('/login');
    return null;
  }

  return (
    <main className="max-w-xl mx-auto px-4 pt-6 pb-32 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full shrink-0"
          onClick={() => router.back()}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <h1 className="text-2xl font-headline font-bold">Friends</h1>
          {movieTitle && <p className="text-sm text-muted-foreground truncate">{movieTitle}</p>}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty */}
      {!loading && entries.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="h-16 w-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
            <Users className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <p className="font-bold font-headline text-lg">No friends activity yet</p>
            <p className="text-sm text-muted-foreground mt-1">None of the people you follow have watched or rated this title</p>
          </div>
        </div>
      )}

      {/* List */}
      {!loading && entries.length > 0 && (
        <div className="bg-card rounded-3xl border border-white/5 divide-y divide-white/5 overflow-hidden">
          {entries.map(e => (
            <Link
              key={e.user.id}
              href={`/profile/${e.user.username}`}
              className="flex items-center gap-4 px-5 py-4 hover:bg-white/5 transition-colors"
            >
              {/* Avatar */}
              <div className="h-12 w-12 rounded-2xl bg-primary/20 overflow-hidden flex items-center justify-center shrink-0">
                {e.user.avatarUrl
                  ? <img src={e.user.avatarUrl} alt={e.user.username} className="w-full h-full object-cover" />
                  : <span className="text-primary font-bold">{(e.user.displayName ?? e.user.username).slice(0, 2).toUpperCase()}</span>
                }
              </div>

              {/* Name + username */}
              <div className="flex-1 min-w-0">
                <p className="font-bold truncate">{e.user.displayName ?? e.user.username}</p>
                <p className="text-sm text-muted-foreground truncate">@{e.user.username}</p>
              </div>

              {/* Activity icons + rating */}
              <div className="flex items-center gap-3 shrink-0">
                {e.watched && (
                  <div className="flex items-center gap-1 text-blue-400">
                    <Eye className="h-4 w-4" />
                  </div>
                )}
                {e.reviewed && (
                  <div className="flex items-center gap-1 text-green-400">
                    <MessageSquare className="h-4 w-4" />
                  </div>
                )}
                {e.rating !== null ? (
                  <div className="flex items-center gap-1 bg-yellow-400/10 px-2.5 py-1 rounded-full">
                    <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                    <span className="text-sm font-black text-yellow-400">{e.rating}/10</span>
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground/50">—</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
