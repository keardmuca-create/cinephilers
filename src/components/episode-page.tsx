"use client"

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  Star, Clock, Calendar, Check, Eye, ChevronLeft, Users, Clapperboard,
  MessageSquare, Share2, Play, Loader2, Plus, ListPlus, Pencil,
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
import { recordWatchedAt, recordManualWatch, removeManualWatch, recordAddedAt } from '@/lib/media-id';
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
  const [draftRating, setDraftRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [myReview, setMyReview] = useState<{ body: string; containsSpoiler: boolean } | null>(null);
  const [savingReview, setSavingReview] = useState(false);

  const [inWatchlist, setInWatchlist] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [lists, setLists] = useState<{ id: string; name: string }[]>([]);

  // The canonical episode id — the same shape used for ratings, the watch log
  // and watch history, so everything lines up across the app.
  const episodeId = `${showTmdbId}-S${season}E${episodeNumber}`;
  const epKey = `S${season}E${episodeNumber}`;
  // The TMDB routes take the bare numeric show id; everything else (ids,
  // storage keys, links) uses the canonical `tmdb-tv-` form.
  const numericShowId = showTmdbId.replace('tmdb-tv-', '').replace('tmdb-', '');

  const still = detail?.still_path ? `https://image.tmdb.org/t/p/w780${detail.still_path}` : null;
  const trailer = detail?.trailers?.[0];
  const people = [...(detail?.cast ?? []), ...(detail?.guestStars ?? [])];

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
      setInWatchlist(!!localStorage.getItem(`watchlist-${episodeId}`));
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

  // Episodes can be saved for later too — you might want one episode because a
  // favourite actor guest-stars, or because the show is an anthology. Today's
  // Pick deliberately skips them so the daily pick stays a film night.
  const toggleWatchlist = useCallback(async () => {
    if (!authUser) { toast({ title: 'Sign in to use your watchlist' }); return; }
    const next = !inWatchlist;
    try {
      const res = next
        ? await fetchWithAuth('/api/watchlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tmdbId: episodeId, mediaType: 'SHOW' }) })
        : await fetchWithAuth(`/api/watchlist/${episodeId}?mediaType=SHOW`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
    } catch {
      toast({ title: "Couldn't update your watchlist. Check your connection.", variant: 'destructive' });
      return;
    }
    setInWatchlist(next);
    try {
      if (next) {
        localStorage.setItem(`watchlist-${episodeId}`, JSON.stringify({ id: episodeId, title: detail?.name ?? '', poster: still ?? showMeta?.poster ?? '', year: detail?.air_date?.slice(0, 4) ?? '', type: 'show' }));
        recordAddedAt(episodeId);
      } else {
        localStorage.removeItem(`watchlist-${episodeId}`);
      }
    } catch { /* ignore */ }
    if (next) logActivity({ action: 'watchlist', contentId: episodeId, contentTitle: detail?.name ?? '', contentPoster: still ?? '', contentYear: '' });
    else removeActivity('watchlist', episodeId);
    toast({ title: next ? 'Added to watchlist' : 'Removed from watchlist' });
  }, [authUser, inWatchlist, episodeId, detail, still, showMeta]);

  const openLists = useCallback(async () => {
    if (!authUser) { toast({ title: 'Sign in to use lists' }); return; }
    setListOpen(true);
    try {
      const res = await fetchWithAuth('/api/lists');
      if (res.ok) { const j = await res.json(); setLists((j.data ?? []).map((l: { id: string; name: string }) => ({ id: l.id, name: l.name }))); }
    } catch { /* ignore */ }
  }, [authUser]);

  const addToList = async (listId: string) => {
    try {
      const res = await fetchWithAuth(`/api/lists/${listId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tmdbId: episodeId, mediaType: 'SHOW',
          title: detail?.name ?? '', poster: still ?? '', year: detail?.air_date?.slice(0, 4) ?? '',
        }),
      });
      if (!res.ok) throw new Error();
      setListOpen(false);
      toast({ title: 'Added to list' });
    } catch {
      toast({ title: "Couldn't add to that list. Try again.", variant: 'destructive' });
    }
  };

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
      // Rate and review in one go, matching the film review dialog.
      if (draftRating > 0 && draftRating !== userRating) await applyRating(draftRating);
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

  if (loading && !detail) return (
    <main className="min-h-screen pb-32 bg-background">
      <Skeleton className="w-full h-[50vh]" />
      <div className="px-6 pt-6 space-y-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </main>
  );

  return (
    <main className="min-h-screen pb-32 bg-background">
      {/* Hero — mirrors the film page: still as backdrop, trailer overlay when
          TMDB has one, back + share as white circles over the image. */}
      <section className="relative w-full h-[50vh] bg-black">
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
              ? <Image src={still} alt={detail?.name ?? ''} fill className="object-cover opacity-60" sizes="100vw" />
              : <div className="w-full h-full flex items-center justify-center"><Clapperboard className="h-10 w-10 text-primary/50" /></div>
            }
            <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />

            {trailer && (
              <button
                onClick={() => setPlayTrailer(true)}
                className="absolute inset-0 flex items-center justify-center cursor-pointer group"
                aria-label="Watch trailer"
              >
                <span className="flex flex-col items-center gap-4 transition-transform active:scale-95">
                  <span className="h-20 w-20 rounded-full bg-white flex items-center justify-center shadow-2xl group-hover:bg-white/90 group-hover:scale-110 transition-all">
                    <Play className="h-10 w-10 fill-black text-black ml-1" />
                  </span>
                  <span className="text-sm font-bold tracking-widest uppercase text-white/80 group-hover:text-white">Watch Trailer</span>
                </span>
              </button>
            )}
          </>
        )}

        <header className="absolute top-0 left-0 right-0 px-6 pb-6 pt-[calc(env(safe-area-inset-top)+1.5rem)] flex justify-between items-center z-20">
          <Button variant="outline" size="icon" className="rounded-full bg-white text-black border-white/80 hover:bg-white/90" onClick={() => router.back()}>
            <ChevronLeft className="h-6 w-6" />
          </Button>
          <Button variant="outline" size="icon" className="rounded-full bg-white text-black border-white/80 hover:bg-white/90" onClick={share} aria-label="Share">
            <Share2 className="h-5 w-5" />
          </Button>
        </header>
      </section>

      <div className="px-6 pt-6 space-y-8">
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
          </div>
        </div>

        {detail?.overview && <p className="text-base text-foreground/80 leading-relaxed">{detail.overview}</p>}

        {/* Review strip — the same tappable prompt the film page uses */}
        <button
          onClick={() => {
            if (!authUser) { toast({ title: 'Sign in to review' }); return; }
            setDraftReview(myReview?.body ?? '');
            setDraftSpoiler(myReview?.containsSpoiler ?? false);
            setDraftRating(userRating);
            setReviewOpen(true);
          }}
          className="w-full flex items-center gap-3 bg-muted/50 hover:bg-muted rounded-2xl px-5 py-4 text-left transition-colors"
        >
          <Pencil className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm text-muted-foreground truncate">
            {myReview ? `Your review: "${myReview.body.slice(0, 50)}${myReview.body.length > 50 ? '…' : ''}"` : `Share your thoughts on ${detail?.name ?? 'this episode'}…`}
          </span>
        </button>

        {/* Actions — same shape and weight as the film page buttons */}
        <div className="flex flex-col md:flex-row gap-3">
          <Button
            variant="outline"
            className="h-14 px-8 rounded-2xl font-bold w-full md:w-auto text-base border-2 border-foreground bg-background text-foreground"
            onClick={toggleWatchlist}
          >
            {inWatchlist ? <Check className="h-5 w-5 mr-2" /> : <Plus className="h-5 w-5 mr-2" />}
            {inWatchlist ? 'In Watchlist' : 'Add to Watchlist'}
          </Button>
          <Button
            variant={watched ? 'default' : 'outline'}
            className={`h-14 px-8 rounded-2xl font-bold w-full md:w-auto text-base transition-all ${watched ? 'bg-accent border-accent' : 'border-2 border-foreground bg-background text-foreground'}`}
            onClick={toggleWatched}
          >
            {watched ? <Check className="h-5 w-5 mr-2" /> : <Eye className="h-5 w-5 mr-2" />}
            {watched ? 'Watched' : 'Mark Watched'}
          </Button>
          <Button
            variant="outline"
            className="h-14 px-8 rounded-2xl font-bold w-full md:w-auto text-base border-2 border-foreground bg-background text-foreground"
            onClick={openLists}
          >
            <ListPlus className="h-5 w-5 mr-2" /> Add to List
          </Button>
        </div>

        {/* Rating card — Cinephilers score once enough people have voted,
            otherwise TMDB's, exactly like the film page. */}
        {(() => {
          const useCine = cineRating?.hasEnough && cineRating.average != null;
          const score = useCine ? cineRating!.average! : (detail?.vote_average ?? 0);
          const count = useCine ? cineRating!.count : (detail?.vote_count ?? 0);
          if (!score) return null;
          return (
            <section className="bg-muted/50 border border-border rounded-3xl px-6 py-5 flex items-center justify-between gap-4">
              <div className="space-y-3 min-w-0">
                <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">{useCine ? 'Cinephilers Rating' : 'TMDB Rating'}</h3>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-5xl font-black font-headline text-foreground">{score.toFixed(1)}</span>
                    <Star className="h-7 w-7 fill-yellow-400 text-yellow-400" />
                  </div>
                  <div className="text-xs text-muted-foreground font-bold mt-1.5">{count.toLocaleString()} ratings</div>
                </div>
              </div>
              <Button
                variant="outline"
                onClick={() => { if (!authUser) { toast({ title: 'Sign in to rate' }); return; } setRateOpen(true); }}
                className="rounded-full border-border font-bold shrink-0"
              >
                <Star className={`h-4 w-4 mr-2 ${userRating > 0 ? 'fill-yellow-400 text-yellow-400' : ''}`} />
                {userRating > 0 ? `Your rating: ${userRating}/10` : 'Rate this'}
              </Button>
            </section>
          );
        })()}

        {/* Your review */}
        {myReview && (
          <section className="space-y-2">
            <h3 className="text-xl font-headline font-bold flex items-center gap-2"><MessageSquare className="h-5 w-5 text-primary" /> Your review</h3>
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
            <h3 className="text-xl font-headline font-bold flex items-center gap-2"><Users className="h-5 w-5 text-primary" /> Friends</h3>
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
            <h3 className="text-xl font-headline font-bold flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" /> Cast &amp; Guest Stars
            </h3>
            <div className="flex gap-5 overflow-x-auto no-scrollbar pb-4">
              {people.map((p, i) => (
                <Link key={`${p.id}-${i}`} href={`/person/${p.id}`} className="shrink-0 w-36 group cursor-pointer block">
                  <div className="relative aspect-[2/3] rounded-2xl overflow-hidden mb-2 group-hover:ring-2 ring-primary ring-offset-2 ring-offset-background transition-all bg-muted flex items-center justify-center">
                    {p.profileImage
                      ? <Image src={p.profileImage} alt={p.name} fill className="object-cover" sizes="144px" />
                      : <Users className="h-12 w-12 text-muted-foreground/40" />
                    }
                  </div>
                  <h4 className="text-xs font-bold font-headline line-clamp-1">{p.name}</h4>
                  {p.role && <p className="text-[10px] text-muted-foreground line-clamp-1">{p.role}</p>}
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Crew */}
        {(detail?.crew?.length ?? 0) > 0 && (
          <section className="space-y-3">
            <h3 className="text-xl font-headline font-bold flex items-center gap-2">
              <Clapperboard className="h-5 w-5 text-primary" /> Crew
            </h3>
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

      {/* Add to list */}
      <Dialog open={listOpen} onOpenChange={setListOpen}>
        <DialogContent className="max-w-sm rounded-3xl border-border">
          <DialogHeader><DialogTitle className="font-headline">Add to List</DialogTitle></DialogHeader>
          <div className="space-y-2 pt-2">
            {lists.length === 0
              ? <p className="text-sm text-muted-foreground py-4 text-center">You haven&apos;t made any lists yet.</p>
              : lists.map(l => (
                  <button
                    key={l.id}
                    onClick={() => addToList(l.id)}
                    className="w-full text-left px-4 py-3 rounded-xl border border-border hover:bg-muted/60 transition-colors font-semibold text-sm"
                  >
                    {l.name}
                  </button>
                ))
            }
          </div>
        </DialogContent>
      </Dialog>

      {/* Review dialog */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-w-lg rounded-3xl border-border">
          <DialogHeader>
            <DialogTitle className="font-headline text-xl">{myReview ? 'Edit your review' : 'Write a review'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 pt-2">
            {/* Rate and review together, same as the film dialog */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">Your Rating</p>
              <div className="flex items-center gap-0.5" onMouseLeave={() => setHoverRating(0)}>
                {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setDraftRating(n === draftRating ? 0 : n)}
                    onMouseEnter={() => setHoverRating(n)}
                    className="p-0.5"
                    aria-label={`Rate ${n} out of 10`}
                  >
                    <Star className={`h-5 w-5 transition-colors ${(hoverRating || draftRating) >= n ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground/40'}`} />
                  </button>
                ))}
                <span className="ml-2 text-sm font-bold text-foreground w-12">{draftRating > 0 ? `${draftRating}/10` : ''}</span>
              </div>
            </div>
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
