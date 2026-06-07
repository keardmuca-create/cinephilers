"use client"

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, MessageSquare, Star, Loader2, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { relativeTime } from '@/lib/activity';

interface CinephilersReview {
  id: string;
  user: { id: string; username: string; displayName: string | null; avatarUrl: string | null };
  body: string;
  containsSpoiler: boolean;
  rating: number | null;
  createdAt: string;
  isOwn: boolean;
  likesCount: number;
  likedByMe: boolean;
}

export default function MovieReviewsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [reviews, setReviews] = useState<CinephilersReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [movieTitle, setMovieTitle] = useState('');

  const toggleLike = async (reviewId: string, likedByMe: boolean) => {
    setReviews(prev => prev.map(r => r.id !== reviewId ? r : {
      ...r,
      likedByMe: !likedByMe,
      likesCount: r.likesCount + (likedByMe ? -1 : 1),
    }));
    try {
      await fetch(`/api/reviews/${reviewId}/like`, {
        method: likedByMe ? 'DELETE' : 'POST',
        credentials: 'include',
      });
    } catch { /* ignore */ }
  };

  useEffect(() => {
    try {
      const cached = localStorage.getItem(`meta-${id}`);
      if (cached) setMovieTitle(JSON.parse(cached).title ?? '');
    } catch { /* ignore */ }

    fetch(`/api/movies/reviews?tmdbId=${encodeURIComponent(id)}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(json => setReviews(json?.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <main className="max-w-xl mx-auto px-4 pt-6 pb-32 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="rounded-full shrink-0" onClick={() => router.back()}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <h1 className="text-2xl font-headline font-bold">Reviews</h1>
          {movieTitle && <p className="text-sm text-muted-foreground truncate">{movieTitle}</p>}
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && reviews.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="h-16 w-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
            <MessageSquare className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <p className="font-bold font-headline text-lg">No reviews yet</p>
            <p className="text-sm text-muted-foreground mt-1">Be the first to review this title</p>
          </div>
        </div>
      )}

      {!loading && reviews.length > 0 && (
        <div className="space-y-4">
          {reviews.map(r => (
            <div key={r.id} className="bg-card rounded-3xl border border-white/5 p-5 space-y-4">
              {/* User row */}
              <div className="flex items-center justify-between gap-3">
                <Link
                  href={r.isOwn ? '/profile' : `/profile/${r.user.username}`}
                  className="flex items-center gap-3 min-w-0 group"
                >
                  <div className="h-10 w-10 rounded-2xl bg-primary/20 overflow-hidden flex items-center justify-center shrink-0">
                    {r.user.avatarUrl
                      ? <img src={r.user.avatarUrl} alt={r.user.username} className="w-full h-full object-cover" />
                      : <span className="text-primary font-bold text-sm">{(r.user.displayName ?? r.user.username).slice(0, 2).toUpperCase()}</span>
                    }
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-sm truncate group-hover:text-primary transition-colors">
                      {r.user.displayName ?? r.user.username}
                      {r.isOwn && <span className="ml-1.5 text-[10px] text-primary font-bold uppercase tracking-wider">You</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">{relativeTime(r.createdAt)}</p>
                  </div>
                </Link>
                {r.rating !== null && (
                  <div className="flex items-center gap-1 bg-yellow-400/10 px-2.5 py-1 rounded-full shrink-0">
                    <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                    <span className="text-sm font-black text-yellow-400">{r.rating}/10</span>
                  </div>
                )}
              </div>

              {/* Review body */}
              <div>
                {r.containsSpoiler && (
                  <span className="text-xs font-bold text-yellow-500/80 mr-1.5">[Spoiler]</span>
                )}
                <p className="text-sm text-foreground/90 leading-relaxed italic">&ldquo;{r.body}&rdquo;</p>
              </div>

              {/* Like button */}
              {!r.isOwn && (
                <button
                  onClick={() => toggleLike(r.id, r.likedByMe)}
                  className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-primary transition-colors"
                >
                  <Heart className={`h-4 w-4 transition-colors ${r.likedByMe ? 'fill-primary text-primary' : ''}`} />
                  {r.likesCount > 0 && <span>{r.likesCount}</span>}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
