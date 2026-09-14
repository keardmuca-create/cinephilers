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
import { RewatchStrip } from '@/components/rewatch-strip';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/auth-context';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { relativeTime } from '@/lib/activity';
import { toast } from '@/hooks/use-toast';
import { batchFetchMeta } from '@/lib/meta-batch';
import { isEpisodeWatched } from '@/lib/episode-store';
import { readUserRating as readStoredRating, setUserRating as storeRating } from '@/lib/library-store';
import { recordWatchedAt, recordManualWatch, removeManualWatch, recordAddedAt, recordRatedAt } from '@/lib/media-id';
import type { CinephilersRating } from '@/lib/cinephilers-rating';

// Mirrors /api/movies/friends-ratings exactly. It was previously declared flat
// (`username`, `avatarUrl` at the top level) while the endpoint has always nested
// them under `user` — so every card here rendered a blank name, no avatar, and a
// link to /profile/undefined. Silent, because TypeScript was told the wrong shape.
interface FriendRating {
  user: { id: string; username: string; displayName: string | null; avatarUrl: string | null };
  rating: number | null;
  watched: boolean;
  reviewed: boolean;
  inWatchlist: boolean;
}

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
  /** True while the account is confirming a watched change — one at a time. */
  const [savingWatched, setSavingWatched] = useState(false);
  const [userRating, setUserRating] = useState(0);
  const [rateOpen, setRateOpen] = useState(false);
  const [cineRating, setCineRating] = useState<CinephilersRating | null>(null);
  const [friends, setFriends] = useState<FriendRating[]>([]);
  // See the matching note on the movie page: the row holds its height from the
  // first paint so the sections under it never get shoved down when it lands.
  const [friendsLoaded, setFriendsLoaded] = useState(false);
  const [playTrailer, setPlayTrailer] = useState(false);

  const [reviewOpen, setReviewOpen] = useState(false);
  const [draftReview, setDraftReview] = useState('');
  const [draftSpoiler, setDraftSpoiler] = useState(false);
  const [draftRating, setDraftRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [myReview, setMyReview] = useState<{ body: string; containsSpoiler: boolean } | null>(null);
  // Every member's review of this episode, yours included: the Cinephilers Reviews a
  // film or a show page shows. An episode page used to show only your own.
  type EpisodeReview = {
    id: string;
    user: { id: string; username: string; displayName: string | null; avatarUrl: string | null };
    body: string;
    containsSpoiler: boolean;
    rating: number | null;
    createdAt: string;
    isOwn: boolean;
  };
  const [reviews, setReviews] = useState<EpisodeReview[]>([]);
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
      setWatched(isEpisodeWatched(showTmdbId, epKey));
      setInWatchlist(!!localStorage.getItem(`watchlist-${episodeId}`));
      const legacy = localStorage.getItem(`ep-rating-${showTmdbId}-${epKey}`);
      const v = readStoredRating(episodeId) ?? (legacy ? parseInt(legacy, 10) : undefined);
      if (v) setUserRating(v);
    } catch { /* ignore */ }
  }, [showTmdbId, epKey, episodeId]);

  // Community score + friends' ratings for this episode
  useEffect(() => {
    fetch(`/api/movies/rating?tmdbId=${encodeURIComponent(episodeId)}&mediaType=SHOW`)
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (j?.data) setCineRating(j.data as CinephilersRating); })
      .catch(() => { /* ignore */ });
    if (!authUser) return;
    setFriendsLoaded(false);
    fetchWithAuth(`/api/movies/friends-ratings?tmdbId=${encodeURIComponent(episodeId)}`)
      .then(r => r.ok ? r.json() : null)
      // Everyone the endpoint returns, not just friends who rated it — someone who
      // watchlisted the episode belongs in this row, and saying "no friend activity"
      // while quietly filtering them out would be a lie.
      .then(j => { setFriends((j?.data ?? []) as FriendRating[]); setFriendsLoaded(true); })
      .catch(() => { setFriendsLoaded(true); });
  }, [episodeId, authUser]);

  // Everyone's reviews of this episode, yours among them. Loaded for signed-out
  // readers too — the endpoint already keeps private accounts' reviews from them —
  // and again once a new review has saved, so it is in the list at once.
  const loadReviews = useCallback(() => {
    fetch(`/api/movies/reviews?tmdbId=${encodeURIComponent(episodeId)}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(j => {
        if (!j?.data) return;
        const list = j.data as EpisodeReview[];
        setReviews(list);
        const own = list.find(r => r.isOwn);
        setMyReview(own ? { body: own.body, containsSpoiler: own.containsSpoiler } : null);
      })
      .catch(() => { /* ignore */ });
  }, [episodeId]);
  useEffect(() => { loadReviews(); }, [loadReviews, authUser]);

  // The whole of marking an episode watched, in one place, because rating one
  // now goes through it too. `silent` is for that caller: a rating already
  // toasts, and "You rated it 8/10" followed by "Guts marked as watched" is two
  // notifications for one tap.
  //
  // The account first, then this device — the watchlist button's order, and the
  // one-way sync rule. This used to write localStorage and send the request
  // without waiting, so a refused request left the screen saying one thing and the
  // database another, and the next login sync quietly put the database's answer
  // back: an unticked episode came back ticked. Resolves to whether it saved.
  const setWatchedState = useCallback(async (now: boolean, silent = false): Promise<boolean> => {
    setSavingWatched(true);
    try {
      const res = await fetchWithAuth('/api/watched/episodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ showTmdbId, season, episode: episodeNumber, watched: now }),
      });
      if (!res.ok) throw new Error('episode watched rejected');
    } catch {
      toast({ title: "Couldn't update watched. Check your connection.", variant: 'destructive' });
      return false;
    } finally {
      setSavingWatched(false);
    }

    setWatched(now);
    try {
      // The show's list is the only local record of its episodes (lib/episode-store).
      const idxKey = `watched-eps-index-${showTmdbId}`;
      const index: string[] = JSON.parse(localStorage.getItem(idxKey) ?? '[]');
      if (now) {
        if (!index.includes(epKey)) localStorage.setItem(idxKey, JSON.stringify([...index, epKey]));
      } else {
        localStorage.setItem(idxKey, JSON.stringify(index.filter(k => k !== epKey)));
      }
    } catch { /* ignore */ }

    if (now) {
      recordWatchedAt(episodeId);
      recordManualWatch(episodeId);
    } else {
      removeManualWatch(episodeId);
    }
    if (!silent) toast({ title: now ? `${detail?.name ?? 'Episode'} marked as watched` : 'Removed from watched' });
    return true;
  }, [showTmdbId, epKey, episodeId, season, episodeNumber, detail, showMeta]);

  const toggleWatched = useCallback(() => {
    if (!authUser) { toast({ title: 'Sign in to track episodes' }); return; }
    if (savingWatched) return;
    void setWatchedState(!watched);
  }, [authUser, watched, savingWatched, setWatchedState]);

  const applyRating = useCallback(async (score: number) => {
    if (!authUser) { toast({ title: 'Sign in to rate episodes' }); return; }
    // Same order as watched above: nothing on screen or on this device changes
    // until the account has the score. Saved locally first, a refused rating
    // looked kept and was gone after the next sync, with no word said.
    try {
      const res = await fetchWithAuth('/api/ratings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tmdbId: episodeId, mediaType: 'SHOW', score }),
      });
      if (!res.ok) throw new Error('episode rating rejected');
    } catch {
      toast({ title: "Couldn't save your rating. Check your connection.", variant: 'destructive' });
      return;
    }
    setUserRating(score);
    storeRating(episodeId, score);
    // Every other rating path stamps this; the episode one did not, so an episode
    // rating fell back to the date the episode was first seen and sorted as though
    // it had been scored then.
    recordRatedAt(episodeId);
    toast({ title: `You rated it ${score}/10!` });
    // An episode is one thing, like a film: you cannot score it without having
    // watched it, so rating marks it seen. This is the film rule from the movie
    // page, not the series one — a SHOW's rating still marks nothing, since its
    // watched state is the sum of its episodes and a score names none of them.
    if (!watched) await setWatchedState(true, true);
    // Refresh the community score so the new vote is reflected immediately.
    fetch(`/api/movies/rating?tmdbId=${encodeURIComponent(episodeId)}&mediaType=SHOW`)
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (j?.data) setCineRating(j.data as CinephilersRating); })
      .catch(() => { /* ignore */ });
  }, [episodeId, detail, showMeta, authUser, watched, setWatchedState]);

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
        // The show's poster, not the episode's screenshot: a watchlisted episode is
        // a poster card on the profile like everything else, and a wide still
        // squeezed into a 2:3 frame was the one card that did not match.
        localStorage.setItem(`watchlist-${episodeId}`, JSON.stringify({ id: episodeId, title: detail?.name ?? '', poster: showMeta?.poster || still || '', year: detail?.air_date?.slice(0, 4) ?? '', type: 'show' }));
        recordAddedAt(episodeId);
      } else {
        localStorage.removeItem(`watchlist-${episodeId}`);
      }
    } catch { /* ignore */ }
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
      // On this device too, once the account has it — the shape the film page and
      // the login sync write. Saved to the account alone, it reached Reviews and
      // the profile only after the next sync brought it down.
      try {
        localStorage.setItem(`review-${episodeId}`, JSON.stringify({
          movieId: episodeId,
          movieTitle: detail?.name ?? '',
          moviePoster: showMeta?.poster ?? '',
          movieYear: detail?.air_date?.slice(0, 4) ?? '',
          content: draftReview.trim(),
          rating: draftRating,
          date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
          containsSpoiler: draftSpoiler,
        }));
      } catch { /* ignore */ }
      // Rate and review in one go, matching the film review dialog.
      if (draftRating > 0 && draftRating !== userRating) await applyRating(draftRating);
      setMyReview({ body: draftReview.trim(), containsSpoiler: draftSpoiler });
      setReviewOpen(false);
      loadReviews();
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
            disabled={savingWatched}
          >
            {watched ? <Check className="h-5 w-5 mr-2" /> : <Eye className="h-5 w-5 mr-2" />}
            {watched ? 'Watched' : 'Mark as Watched'}
          </Button>
          <Button
            variant="outline"
            className="h-14 px-8 rounded-2xl font-bold w-full md:w-auto text-base border-2 border-foreground bg-background text-foreground"
            onClick={openLists}
          >
            <ListPlus className="h-5 w-5 mr-2" /> Add to List
          </Button>
        </div>

        {/* Rewatch strip — the same component as the film page's. */}
        {authUser && watched && <RewatchStrip tmdbId={episodeId} mediaType="SHOW" />}

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
                    <Star className={`h-7 w-7 ${useCine ? 'fill-primary text-primary' : 'fill-yellow-400 text-yellow-400'}`} />
                  </div>
                  <div className="text-xs text-muted-foreground font-bold mt-1.5">{count.toLocaleString()} ratings</div>
                </div>
              </div>
              {userRating > 0 ? (
                // Same as the film page: once rated, your score mirrors the one
                // beside it, and tapping it changes the score.
                <button
                  type="button"
                  onClick={() => setRateOpen(true)}
                  aria-label={`Your rating: ${userRating} out of 10. Tap to change it`}
                  className="space-y-3 text-center shrink-0 group"
                >
                  <div className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Your Rating</div>
                  <div>
                    <div className="flex items-center justify-center gap-1.5">
                      <span className="text-4xl font-black font-headline text-primary group-hover:opacity-80 transition-opacity">{userRating}</span>
                      <Star className="h-6 w-6 text-primary" />
                    </div>
                    {/* Holds the height of the "ratings" count opposite, so the two numbers line up. */}
                    <div className="text-xs font-bold mt-1.5 invisible" aria-hidden>&nbsp;</div>
                  </div>
                </button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => { if (!authUser) { toast({ title: 'Sign in to rate' }); return; } setRateOpen(true); }}
                  className="rounded-full border-border font-bold shrink-0"
                >
                  <Star className="h-4 w-4 mr-2" />
                  Rate this
                </Button>
              )}
            </section>
          );
        })()}

        {/* Cinephilers Reviews — every member's review of this episode, yours first
            and tagged You, as a film or show page shows them. It replaces a box that
            showed only your own, so nobody else's review of an episode was readable
            here. See All opens them all. */}
        {reviews.length > 0 && (() => {
          const own = reviews.find(r => r.isOwn);
          const preview = [...(own ? [own] : []), ...reviews.filter(r => !r.isOwn)].slice(0, 3);
          return (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xl font-headline font-bold flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-primary" /> Cinephilers Reviews
                </h3>
                <Link
                  href={`/movie/${episodeId}/reviews`}
                  className="text-xs text-primary border border-primary/30 rounded-full px-3 py-1 hover:bg-primary/10 transition-colors font-semibold shrink-0"
                >
                  See All
                </Link>
              </div>
              <div className="space-y-3">
                {preview.map(r => (
                  <div key={r.id} className="bg-card rounded-2xl border border-border p-4 space-y-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <Link href={r.isOwn ? '/profile' : `/profile/${r.user.username}`} className="flex items-center gap-3 min-w-0 group">
                        <div className="h-9 w-9 rounded-2xl bg-primary/20 overflow-hidden flex items-center justify-center shrink-0">
                          {r.user.avatarUrl
                            ? <img src={r.user.avatarUrl} alt={r.user.username} className="w-full h-full object-cover" />
                            : <span className="text-primary font-bold text-xs">{(r.user.displayName ?? r.user.username).slice(0, 2).toUpperCase()}</span>}
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
                        <div className="flex items-center gap-1 bg-primary/10 px-2.5 py-1 rounded-full shrink-0">
                          <Star className="h-3.5 w-3.5 text-primary" />
                          <span className="text-sm font-black text-primary">{r.rating}/10</span>
                        </div>
                      )}
                    </div>
                    <SpoilerWrap isSpoiler={r.containsSpoiler}>
                      <p className="text-sm text-foreground/90 italic leading-relaxed">&ldquo;{r.body}&rdquo;</p>
                    </SpoilerWrap>
                  </div>
                ))}
              </div>
            </section>
          );
        })()}

        {/* Friends' ratings */}
        {authUser && (
          <section className="space-y-3">
            <h3 className="text-xl font-headline font-bold flex items-center gap-2"><Users className="h-5 w-5 text-primary" /> Friends</h3>
            {!friendsLoaded ? (
              // Deliberately the real item markup with blank content — a hand-built
              // box would have to guess the line heights, and guessing wrong is the
              // jump this is here to prevent.
              <div className="flex gap-4 overflow-x-auto no-scrollbar" aria-hidden>
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex flex-col items-center gap-1.5 shrink-0 w-16 animate-pulse">
                    <Avatar className="h-11 w-11" />
                    <span className="text-[11px] font-semibold w-full text-center">&nbsp;</span>
                    <span className="flex items-center gap-0.5 text-xs font-bold">&nbsp;</span>
                  </div>
                ))}
              </div>
            ) : friends.length === 0 ? (
              // The zero-width invisible item is what makes this the same height as
              // the row it replaces — an avatar plus two lines of text isn't a single
              // Tailwind height, and hardcoding a guess is how the jump creeps back.
              <div className="flex items-center gap-4">
                <div className="flex flex-col items-center gap-1.5 shrink-0 w-0 overflow-hidden invisible" aria-hidden>
                  <Avatar className="h-11 w-11" />
                  <span className="text-[11px] font-semibold">&nbsp;</span>
                  <span className="flex items-center gap-0.5 text-xs font-bold">&nbsp;</span>
                </div>
                <p className="text-sm text-muted-foreground">No friend activity yet.</p>
              </div>
            ) : (
            <div className="flex gap-4 overflow-x-auto no-scrollbar">
              {friends.map(f => (
                <Link key={f.user.id} href={`/profile/${f.user.username}`} className="flex flex-col items-center gap-1.5 shrink-0 w-16 group">
                  <Avatar className="h-11 w-11">
                    {f.user.avatarUrl && <AvatarImage src={f.user.avatarUrl} alt={f.user.username} />}
                  </Avatar>
                  <span className="text-[11px] font-semibold truncate w-full text-center group-hover:text-primary transition-colors">
                    {f.user.displayName ?? f.user.username}
                  </span>
                  {/* A friend who only watchlisted it has no score to show, but the
                      line still has to occupy its height or the row goes ragged. */}
                  <span className="flex items-center gap-0.5 text-xs font-bold text-primary">
                    {f.rating != null ? <><Star className="h-3 w-3" />{f.rating}</> : <>&nbsp;</>}
                  </span>
                </Link>
              ))}
            </div>
            )}
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
                    <Star className={`h-5 w-5 transition-colors ${(hoverRating || draftRating) >= n ? 'fill-primary text-primary' : 'text-muted-foreground/40'}`} />
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
