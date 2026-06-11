"use client"

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, MessageSquare, Star, Loader2, Heart, Send, Trash2, Flag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { relativeTime } from '@/lib/activity';
import { useAuth } from '@/contexts/auth-context';
import { fetchWithAuth } from '@/lib/fetch-with-auth';

interface ReviewComment {
  id: string;
  body: string;
  createdAt: string;
  user: { id: string; username: string; displayName: string | null; avatarUrl: string | null };
}

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

const REPORT_REASONS = [
  'Spam or advertising',
  'Inappropriate or offensive content',
  'Spoilers without warning',
  'Harassment or bullying',
];

function ReportDialog({ targetType, targetId, onClose }: { targetType: 'review' | 'comment'; targetId: string; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!reason || submitting) return;
    setSubmitting(true);
    try {
      await fetchWithAuth('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetType, targetId, reason }),
      });
      setDone(true);
      setTimeout(onClose, 1500);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-white/10 rounded-3xl p-6 w-full max-w-sm space-y-4" onClick={e => e.stopPropagation()}>
        {done ? (
          <div className="text-center py-4">
            <p className="font-bold font-headline text-lg">Thanks for reporting</p>
            <p className="text-sm text-muted-foreground mt-1">We&apos;ll review this shortly.</p>
          </div>
        ) : (
          <>
            <div>
              <h3 className="font-headline font-bold text-lg">Report {targetType}</h3>
              <p className="text-sm text-muted-foreground mt-1">Why are you reporting this?</p>
            </div>
            <div className="space-y-2">
              {REPORT_REASONS.map(r => (
                <button
                  key={r}
                  onClick={() => setReason(r)}
                  className={`w-full text-left px-4 py-3 rounded-2xl text-sm font-medium transition-colors border ${reason === r ? 'border-primary bg-primary/10 text-foreground' : 'border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10'}`}
                >
                  {r}
                </button>
              ))}
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={onClose} className="flex-1 py-3 rounded-2xl border border-white/10 text-sm font-bold text-muted-foreground hover:bg-white/5 transition-colors">
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={!reason || submitting}
                className="flex-1 py-3 rounded-2xl bg-primary text-white text-sm font-bold disabled:opacity-40 hover:bg-primary/90 transition-colors"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Submit'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CommentSection({ reviewId, currentUser }: { reviewId: string; currentUser: { id: string; username: string; displayName: string | null; avatarUrl: string | null } | null }) {
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [reportTarget, setReportTarget] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/reviews/${reviewId}/comments`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(json => setComments(json?.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [reviewId]);

  const submit = async () => {
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetchWithAuth(`/api/reviews/${reviewId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text.trim() }),
      });
      if (res.ok) {
        const json = await res.json();
        setComments(prev => [...prev, json.data]);
        setText('');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const deleteComment = async (commentId: string) => {
    await fetchWithAuth(`/api/reviews/${reviewId}/comments/${commentId}`, { method: 'DELETE' });
    setComments(prev => prev.filter(c => c.id !== commentId));
  };

  return (
    <div className="space-y-3 pt-1">
      {loading && <div className="h-4 bg-muted rounded-full w-1/3 animate-pulse" />}

      {!loading && comments.length > 0 && (
        <div className="space-y-2.5">
          {comments.map(c => (
            <div key={c.id} className="flex gap-2.5 group">
              <Link href={currentUser?.id === c.user.id ? '/profile' : `/profile/${c.user.username}`}>
                <div className="h-7 w-7 rounded-xl bg-primary/20 overflow-hidden flex items-center justify-center shrink-0">
                  {c.user.avatarUrl
                    ? <img src={c.user.avatarUrl} alt={c.user.username} className="w-full h-full object-cover" />
                    : <span className="text-primary font-bold text-[10px]">{(c.user.displayName ?? c.user.username).slice(0, 2).toUpperCase()}</span>
                  }
                </div>
              </Link>
              <div className="flex-1 min-w-0 bg-muted/30 rounded-2xl px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={currentUser?.id === c.user.id ? '/profile' : `/profile/${c.user.username}`} className="text-xs font-bold hover:text-primary transition-colors">
                      {c.user.displayName ?? c.user.username}
                    </Link>
                    <span className="text-xs text-muted-foreground ml-1.5">{relativeTime(c.createdAt)}</span>
                    <p className="text-xs text-foreground/90 mt-0.5 leading-relaxed">{c.body}</p>
                  </div>
                  {currentUser?.id === c.user.id ? (
                    <button onClick={() => deleteComment(c.id)} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : currentUser && (
                    <button onClick={() => setReportTarget(c.id)} className="text-muted-foreground/40 hover:text-yellow-500 transition-colors shrink-0">
                      <Flag className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {currentUser && (
        <div className="flex gap-2.5 items-center">
          <div className="h-7 w-7 rounded-xl bg-primary/20 overflow-hidden flex items-center justify-center shrink-0">
            {currentUser.avatarUrl
              ? <img src={currentUser.avatarUrl} alt={currentUser.username} className="w-full h-full object-cover" />
              : <span className="text-primary font-bold text-[10px]">{(currentUser.displayName ?? currentUser.username).slice(0, 2).toUpperCase()}</span>
            }
          </div>
          <div className="flex-1 flex items-center gap-2 bg-muted/30 rounded-2xl px-3 py-2">
            <input
              ref={inputRef}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submit(); }}
              placeholder="Add a comment…"
              maxLength={500}
              className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/60"
            />
            {text.trim() && (
              <button onClick={submit} disabled={submitting} className="text-primary shrink-0">
                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              </button>
            )}
          </div>
        </div>
      )}
      {reportTarget && (
        <ReportDialog targetType="comment" targetId={reportTarget} onClose={() => setReportTarget(null)} />
      )}
    </div>
  );
}

export default function MovieReviewsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [reviews, setReviews] = useState<CinephilersReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [movieTitle, setMovieTitle] = useState('');
  const [reportReviewId, setReportReviewId] = useState<string | null>(null);

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

  const deleteReview = async (reviewId: string) => {
    if (!window.confirm('Delete your review? This cannot be undone.')) return;
    setReviews(prev => prev.filter(r => r.id !== reviewId));
    try { localStorage.removeItem(`review-${id}`); } catch { /* ignore */ }
    try {
      await fetchWithAuth(`/api/reviews/${reviewId}`, { method: 'DELETE' });
    } catch { /* ignore */ }
  };

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

  const currentUserForComments = user ? {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
  } : null;

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

              {/* Delete own review */}
              {r.isOwn && (
                <div className="flex justify-end">
                  <button
                    onClick={() => deleteReview(r.id)}
                    className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                </div>
              )}

              {/* Like + Report buttons */}
              {!r.isOwn && user && (
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => toggleLike(r.id, r.likedByMe)}
                    className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-primary transition-colors"
                  >
                    <Heart className={`h-4 w-4 transition-colors ${r.likedByMe ? 'fill-primary text-primary' : ''}`} />
                    {r.likesCount > 0 && <span>{r.likesCount}</span>}
                  </button>
                  <button
                    onClick={() => setReportReviewId(r.id)}
                    className="text-muted-foreground/40 hover:text-yellow-500 transition-colors"
                    title="Report review"
                  >
                    <Flag className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* Comments */}
              <CommentSection reviewId={r.id} currentUser={currentUserForComments} />
            </div>
          ))}
        </div>
      )}

      {reportReviewId && (
        <ReportDialog targetType="review" targetId={reportReviewId} onClose={() => setReportReviewId(null)} />
      )}
    </main>
  );
}
