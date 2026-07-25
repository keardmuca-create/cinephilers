"use client"

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  Star, Clock, Calendar, Check, Eye, ChevronLeft, Users, Clapperboard,
  MessageSquare, Share2, Play, Loader2,
} from 'lucide-react';
import { EpisodeDetail } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { RatingSheet } from '@/components/rating-sheet';
import { SpoilerWrap } from '@/components/spoiler-wrap';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/auth-context';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { toast } from '@/hooks/use-toast';
import { batchFetchMeta } from '@/lib/meta-batch';
import { recordWatchedAt, recordManualWatch, removeManualWatch } from '@/lib/media-id';
import { logActivity, removeActivity } from '@/lib/activity';
import type { CinephilersRating } from '@/lib/cinephilers-rating';

interface FriendRating { username: string; displayName: string | null; avatarUrl: string | null; rating: number | null }

export function EpisodePage({ showTmdbId, season, episodeNumber }: {
  showTmdbId: string;
  season: number;
  episodeNumber: number;
}) {
  const router = useRouter();
  const { user: authUser } = useAuth();

  const [detail, setDetail] = useState<EpisodeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showMeta, setShowMeta] = useState<{ title: string; poster: string } | null>(null);

  const [watched, setWatched] = useState(false);
  const [userRating, setUserRating] = useState(0);
  const [rateOpen, setRateOpen] = useState(false);
  const [cineRating, setCineRating] = useState<CinephilersRating | null>(null);
  const [friends, setFriends] = useState<FriendRating[]>([]);
  const [playTrailer, setPlayTrailer] = useState(false);

  const [reviewOpen, setReviewOpen] = useState(false);
  const [draftReview, setDraftReview] = useState('');
  const [draftSpoiler, setDraftSpoiler] = useState(false);
  const [myReview, setMyReview] = useState<{ body: string; containsSpoiler: boolean } | null>(null);
  const [savingReview, setSavingReview] = useState(false);

  // The canonical episode id — the same shape used for ratings, the watch log
  // and watch history, so everything lines up across the app.
  const episodeId = `${showTmdbId}-S${season}E${episodeNumber}`;
  const epKey = `S${season}E${episodeNumber}`;
  // The TMDB routes take the bare numeric show id; everything else (ids,
  // storage keys, links) uses the canonical `tmdb-tv-` form.
  const numericShowId = showTmdbId.replace('tmdb-tv-', '').replace('tmdb-', '');

  useEffect(() => {
    setLoading(true);
    setDetail(null);
    setPlayTrailer(false);
    fetch(`/api/tv/${numericShowId}/season/${season}/episode/${episodeNumber}`)
      .then(r => r.json())
      .then((d: EpisodeDetail & { error?: string }) => { if (!d.error) setDetail(d); })
      .catch(() => { /* ignore */ })
      .finally(() => setLoading(false));
  }, [numericShowId, season, episodeNumber]);

  // Parent show title + poster, for the header link and the rating sheet.
  useEffect(() => {
    batchFetchMeta([showTmdbId])
      .then(map => {
        const m = map[showTmdbId];
        if (m) setShowMeta({ title: m.title ?? '', poster: m.poster ?? '' });
      })
      .catch(() => { /* ignore */ });
  }, [showTmdbId]);

  // Local state: watched flag + existing rating
  useEffect(() => {
    try {
      setWatched(localStorage.getItem(`watched-ep-${showTmdbId}-${epKey}`) === 'true');
      const legacy = localStorage.getItem(`ep-rating-${showTmdbId}-${epKey}`);
      const v = localStorage.getItem(`movie-rating-${episodeId}`) ?? legacy;
      if (v) setUserRating(parseInt(v, 10));
    } catch { /* ignore */ }
  }, [showTmdbId, epKey, episodeId]);

  // Community score + friends' ratings for this episode
  useEffect(() => {
    fetch(`/api/movies/rating?tmdbId=${encodeURIComponent(episodeId)}&mediaType=SHOW`)
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (j?.data) setCineRating(j.data as CinephilersRating); })
      .catch(() => { /* ignore */ });
    if (!authUser) return;
    fetchWithAuth(`/api/movies/friends-ratings?tmdbId=${encodeURIComponent(episodeId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (j?.data) setFriends((j.data as FriendRating[]).filter(f => f.rating != null)); })
      .catch(() => { /* ignore */ });
  }, [episodeId, authUser]);

  // Existing review for this episode
  useEffect(() => {
    if (!authUser) return;
    fetch(`/api/movies/reviews?tmdbId=${encodeURIComponent(episodeId)}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(j => {
        const own = (j?.data ?? []).find((r: { isOwn?: boolean }) => r.isOwn);
        if (own) setMyReview({ body: own.body, containsSpoiler: own.containsSpoiler });
      })
      .catch(() => { /* ignore */ });
  }, [episodeId, authUser]);

  const toggleWatched = useCallback(() => {
    if (!authUser) { toast({ title: 'Sign in to track episodes' }); return; }
    const now = !watched;
    setWatched(now);
    try {
      const lsKey = `watched-ep-${showTmdbId}-${epKey}`;
      const idxKey = `watched-eps-index-${showTmdbId}`;
      const index: string[] = JSON.parse(localStorage.getItem(idxKey) ?? '[]');
      if (now) {
        localStorage.setItem(lsKey, 'true');
        if (!index.includes(epKey)) localStorage.setItem(idxKey, JSON.stringify([...index, epKey]));
      } else {
        localStorage.removeItem(lsKey);
        localStorage.setItem(idxKey, JSON.stringify(index.filter(k => k !== epKey)));
      }
    } catch { /* ignore */ }

    if (now) {
      recordWatchedAt(episodeId);
      recordManualWatch(episodeId);
      logActivity({ action: 'watched', contentId: episodeId, contentTitle: detail?.name ?? '', contentPoster: showMeta?.poster ?? '', contentYear: '' });
    } else {
      removeManualWatch(episodeId);
      removeActivity('watched', episodeId);
    }
    toast({ title: now ? `${detail?.name ?? 'Episode'} marked as watched` : 'Removed from watched' });
    fetchWithAuth('/api/watched/episodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ showTmdbId, season, episode: episodeNumber, watched: now }),
    }).catch(() => { /* background sync */ });
  }, [authUser, watched, showTmdbId, epKey, episodeId, season, episodeNumber, detail, showMeta]);

  const applyRating = useCallback(async (score: number) => {
    setUserRating(score);
    try { localStorage.setItem(`movie-rating-${episodeId}`, String(score)); } catch { /* ignore */ }
    logActivity({ action: 'rated', contentId: episodeId, contentTitle: detail?.name ?? '', contentPoster: showMeta?.poster ?? '', contentYear: '', rating: score });
    toast({ title: `You rated it ${score}/10!` });
    await fetchWithAuth('/api/ratings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tmdbId: episodeId, mediaType: 'SHOW', score }),
    }).catch(() => { /* background sync */ });
    // Refresh the community score so the new vote is reflected immediately.
    fetch(`/api/movies/rating?tmdbId=${encodeURIComponent(episodeId)}&mediaType=SHOW`)
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (j?.data) setCineRating(j.data as CinephilersRating); })
      .catch(() => { /* ignore */ });
  }, [episodeId, detail, showMeta]);

  const submitReview = async () => {
    if (!draftReview.trim()) return;
    setSavingReview(true);
    try {
      const res = await fetchWithAuth('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tmdbId: episodeId, mediaType: 'SHOW', body: draftReview.trim(), containsSpoiler: draftSpoiler }),
      });
      if (!res.ok) { toast({ title: "Couldn't save your review. Try again.", variant: 'destructive' }); return; }
      setMyReview({ body: draftReview.trim(), containsSpoiler: draftSpoiler });
      setReviewOpen(false);
      logActivity({ action: 'reviewed', contentId: episodeId, contentTitle: detail?.name ?? '', contentPoster: showMeta?.poster ?? '', contentYear: '' });
      toast({ title: 'Review saved' });
    } catch {
      toast({ title: "Couldn't save your review. Check your connection.", variant: 'destructive' });
    } finally { setSavingReview(false); }
  };

  const share = async () => {
    const url = `${window.location.origin}/movie/${episodeId}`;
    const title = `${showMeta?.title ?? ''} — ${detail?.name ?? ''}`;
    try {
      if (navigator.share) await navigator.share({ title, url });
      else { await navigator.clipboard.writeText(url); toast({ title: 'Link copied' }); }
    } catch { /* user cancelled */ }
  };

  const still = detail?.still_path ? `https://image.tmdb.org/t/p/w780${detail.still_path}` : null;
  const trailer = detail?.trailers?.[0];
  const people = [...(detail?.cast ?? []), ...(detail?.guestStars ?? [])];

  if (loading && !detail) return (
    <main className="max-w-3xl mx-auto pb-32">
      <Skeleton className="w-full aspect-video" />
      <div className="px-5 pt-5 space-y-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </main>
  );

  return (
    <main className="max-w-3xl mx-auto pb-32">
      {/* Hero */}
      <div className="relative w-full aspect-video bg-muted">
        {playTrailer && trailer ? (
          <iframe
            src={`https://www.youtube.com/embed/${trailer.key}?autoplay=1`}
            title={trailer.name}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
            allowFullScreen
            className="absolute inset-0 w-full h-full"
          />
        ) : (
          <>
            {still
              ? <Image src={still} alt={detail?.name ?? ''} fill className="object-cover" sizes="100vw" priority />
              : <div className="w-full h-full flex items-center justify-center"><Clapperboard className="h-10 w-10 text-primary/50" /></div>
            }
            {trailer && (
              <button
                onClick={() => setPlayTrailer(true)}
                className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/45 transition-colors"
                aria-label="Play trailer"
              >
                <span className="h-14 w-14 rounded-full bg-white/95 flex items-center justify-center">
                  <Play className="h-6 w-6 text-black ml-0.5" />
                </span>
              </button>
            )}
          </>
        )}
        <button
          onClick={() => router.back()}
          aria-label="Go back"
          className="absolute top-3 left-3 h-9 w-9 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      </div>

      <div className="px-5 pt-5 space-y-6">
        {/* Title block */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-primary border border-primary/40 rounded-full px-2.5 py-0.5">
              S{season} · E{episodeNumber}
            </span>
            <Link href={`/movie/${showTmdbId}`} className="text-sm font-semibold text-muted-foreground hover:text-primary transition-colors">
              {showMeta?.title ?? 'Show'}
            </Link>
          </div>
          <h1 className="text-2xl font-headline font-bold leading-tight">{detail?.name}</h1>
          <div className="flex items-center gap-4 flex-wrap text-sm text-muted-foreground">
            {detail?.air_date && (
              <span className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-primary" />
                {new Date(detail.air_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </span>
            )}
            {!!detail?.runtime && <span className="flex items-center gap-1.5"><Clock className="h-4 w-4 text-primary" />{detail.runtime} min</span>}
            {!!detail?.vote_average && detail.vote_average > 0 && (
              <span className="flex items-center gap-1.5">
                <Star className="h-4 w-4 fill-primary text-primary" />
                <span className="font-bold text-foreground">{detail.vote_average.toFixed(1)}</span>
                <span className="text-xs">({detail.vote_count} votes)</span>
              </span>
            )}
          </div>
        </div>

        {/* Cinephilers community score */}
        {cineRating?.hasEnough && cineRating.average != null && (
          <div className="flex items-center gap-2 bg-muted/50 border border-border rounded-2xl px-4 py-3 w-fit">
            <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
            <span className="font-bold">{cineRating.average.toFixed(1)}</span>
            <span className="text-xs text-muted-foreground">Cinephilers · {cineRating.count} ratings</span>
          </div>
        )}

        {detail?.overview && <p className="text-sm text-foreground/80 leading-relaxed">{detail.overview}</p>}

        {/* Actions */}
        <div className="flex flex-wrap gap-2.5">
          <Button
            onClick={toggleWatched}
            variant={watched ? 'default' : 'outline'}
            className="rounded-xl font-bold gap-2"
          >
            {watched ? <Check className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {watched ? 'Watched' : 'Mark watched'}
          </Button>
          <Button onClick={() => (authUser ? setRateOpen(true) : toast({ title: 'Sign in to rate' }))} variant="outline" className="rounded-xl font-bold gap-2">
            <Star className={`h-4 w-4 ${userRating ? 'fill-yellow-400 text-yellow-400' : ''}`} />
            {userRating ? `${userRating}/10` : 'Rate'}
          </Button>
          <Button
            onClick={() => {
              if (!authUser) { toast({ title: 'Sign in to review' }); return; }
              setDraftReview(myReview?.body ?? '');
              setDraftSpoiler(myReview?.containsSpoiler ?? false);
              setReviewOpen(true);
            }}
            variant="outline"
            className="rounded-xl font-bold gap-2"
          >
            <MessageSquare className="h-4 w-4" />{myReview ? 'Edit review' : 'Review'}
          </Button>
          <Button onClick={share} variant="outline" className="rounded-xl font-bold gap-2">
            <Share2 className="h-4 w-4" />Share
          </Button>
        </div>

        {/* Your review */}
        {myReview && (
          <section className="space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Your review</h2>
            <div className="bg-card border border-border rounded-2xl p-4">
              <SpoilerWrap isSpoiler={myReview.containsSpoiler}>
                <p className="text-sm text-muted-foreground italic leading-relaxed">&ldquo;{myReview.body}&rdquo;</p>
              </SpoilerWrap>
            </div>
          </section>
        )}

        {/* Friends' ratings */}
        {friends.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Friends&apos; ratings</h2>
            <div className="flex gap-4 overflow-x-auto no-scrollbar">
              {friends.map(f => (
                <Link key={f.username} href={`/profile/${f.username}`} className="flex flex-col items-center gap-1.5 shrink-0 w-16 group">
                  <Avatar className="h-11 w-11">
                    {f.avatarUrl && <AvatarImage src={f.avatarUrl} alt={f.username} />}
                  </Avatar>
                  <span className="text-[11px] font-semibold truncate w-full text-center group-hover:text-primary transition-colors">
                    {f.displayName ?? f.username}
                  </span>
                  <span className="flex items-center gap-0.5 text-xs font-bold text-yellow-400">
                    <Star className="h-3 w-3 fill-current" />{f.rating}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Cast & guest stars */}
        {people.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />Cast &amp; guest stars
            </h2>
            <div className="flex gap-4 overflow-x-auto no-scrollbar pb-1">
              {people.map((p, i) => (
                <Link key={`${p.id}-${i}`} href={`/person/${p.id}`} className="flex flex-col items-center gap-1.5 shrink-0 w-20 group">
                  <Avatar className="h-16 w-16">
                    {p.profileImage && <AvatarImage src={p.profileImage} alt={p.name} />}
                  </Avatar>
                  <span className="text-[11px] font-semibold text-center leading-tight line-clamp-2 group-hover:text-primary transition-colors">{p.name}</span>
                  {p.role && <span className="text-[10px] text-muted-foreground text-center leading-tight line-clamp-1">{p.role}</span>}
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Crew */}
        {(detail?.crew?.length ?? 0) > 0 && (
          <section className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <Clapperboard className="h-4 w-4 text-primary" />Crew
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {detail!.crew.slice(0, 8).map((c, i) => (
                <div key={i} className="bg-card border border-border rounded-xl px-3.5 py-2.5">
                  <p className="text-sm font-semibold truncate">{c.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{c.job}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Rating sheet */}
      <RatingSheet
        open={rateOpen}
        onClose={() => setRateOpen(false)}
        title={detail?.name ?? ''}
        poster={showMeta?.poster ?? ''}
        currentRating={userRating}
        onRate={score => { setRateOpen(false); applyRating(score); }}
      />

      {/* Review dialog */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-w-lg rounded-3xl border-border">
          <DialogHeader>
            <DialogTitle className="font-headline text-xl">{myReview ? 'Edit your review' : 'Write a review'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 pt-2">
            <textarea
              value={draftReview}
              onChange={e => setDraftReview(e.target.value)}
              placeholder={`What did you think of ${detail?.name ?? 'this episode'}?`}
              className="w-full h-36 p-3 rounded-xl border border-border bg-muted/30 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <button type="button" onClick={() => setDraftSpoiler(v => !v)} className="flex items-center gap-2.5 w-full text-left">
              <span className={`h-5 w-5 rounded-md border-2 flex items-center justify-center transition-colors shrink-0 ${draftSpoiler ? 'bg-yellow-500 border-yellow-500' : 'border-border'}`}>
                {draftSpoiler && <Check className="h-3.5 w-3.5 text-black" />}
              </span>
              <span className="text-sm font-semibold">This review contains spoilers</span>
            </button>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setReviewOpen(false)}>Cancel</Button>
              <Button className="flex-1 rounded-xl" disabled={!draftReview.trim() || savingReview} onClick={submitReview}>
                {savingReview ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save review'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
