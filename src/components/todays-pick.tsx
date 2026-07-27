"use client"

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Play, Info, Star, Bookmark, Sparkles, Loader2, Film } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Movie } from '@/lib/types';
import { useAuth } from '@/contexts/auth-context';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { seededShuffle } from '@/lib/seed-shuffle';
import { batchFetchMeta } from '@/lib/meta-batch';
import { isEpisodeId } from '@/lib/media-id';

// Stable per-day seed so the pick can't be rerolled — same movie all day,
// a new one tomorrow.
function daySeed(): number {
  const n = new Date();
  return n.getFullYear() * 10000 + (n.getMonth() + 1) * 100 + n.getDate();
}

// The day's pick from the watchlist: released, not yet watched, deterministic.
type PickResult = { id: string } | 'empty-list' | 'none-released' | 'all-recent';

async function pickWatchlistId(recentIds: string[] = []): Promise<PickResult> {
  const ids: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith('watchlist-')) continue;
      const id = k.slice('watchlist-'.length);
      if (localStorage.getItem(`watched-${id}`) === 'true') continue; // exclude watched
      if (isEpisodeId(id)) continue; // single episodes can be saved, but the day's pick is a film night
      ids.push(id);
    }
  } catch { /* ignore */ }
  if (ids.length === 0) return 'empty-list';

  // Fetch exact release dates for anything missing them, then keep ONLY films
  // whose release date is in the past. No year-based guessing — an upcoming
  // 2026 film must never count as released just because the year matches.
  const metaMap = await batchFetchMeta(ids, { needReleaseDate: true });
  const now = Date.now();
  const released = ids.filter(id => {
    const rd = metaMap[id]?.releaseDate;
    return !!rd && new Date(rd).getTime() <= now;
  });
  if (released.length === 0) return 'none-released';

  // Don't serve the same film again for a fortnight. If that leaves nothing,
  // say so rather than repeating — the pick exists to help you choose, and an
  // empty pool means the watchlist itself needs more titles.
  const recent = new Set(recentIds);
  const fresh = released.filter(id => !recent.has(id));
  if (fresh.length === 0) return 'all-recent';

  fresh.sort();
  return { id: seededShuffle(fresh, daySeed())[0] };
}

export function TodaysPick() {
  const { user, loading: authLoading } = useAuth();
  const [movie, setMovie] = useState<Movie | null>(null);
  const [generating, setGenerating] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [emptyWatchlist, setEmptyWatchlist] = useState(false);
  const [noReleased, setNoReleased] = useState(false);
  const [allRecent, setAllRecent] = useState(false);
  const [guestPrompt, setGuestPrompt] = useState(false);
  const [recentIds, setRecentIds] = useState<string[]>([]);

  const showPick = async (tmdbId: string) => {
    try {
      const r = await fetch(`/api/movies/${tmdbId}`);
      const m = await r.json();
      if (m && !m.error) setMovie(m as Movie);
    } catch { /* ignore */ }
  };

  // The SERVER is the source of truth: ask it for today's pick on load, so every
  // device shows the same locked pick and it matches the feed. localStorage is
  // no longer used (that's what made the laptop and phone disagree).
  useEffect(() => {
    if (authLoading) return;
    if (!user) { setInitializing(false); return; }
    let cancelled = false;
    fetchWithAuth('/api/daily-pick')
      .then(r => r.ok ? r.json() : null)
      .then(async (json) => {
        const data = json?.data as { pick: { tmdbId: string } | null; recent?: string[] } | null;
        if (cancelled) return;
        setRecentIds(data?.recent ?? []);
        if (data?.pick?.tmdbId) await showPick(data.pick.tmdbId);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setInitializing(false); });
    return () => { cancelled = true; };
  }, [user, authLoading]);

  const generate = async () => {
    if (!user) { setGuestPrompt(true); return; }
    if (generating) return;
    setGenerating(true);
    setEmptyWatchlist(false);
    setNoReleased(false);
    setAllRecent(false);
    const result = await pickWatchlistId(recentIds);
    if (result === 'empty-list') { setEmptyWatchlist(true); setGenerating(false); return; }
    if (result === 'none-released') { setNoReleased(true); setGenerating(false); return; }
    if (result === 'all-recent') { setAllRecent(true); setGenerating(false); return; }
    try {
      // Record my roll — the server returns the AUTHORITATIVE pick (mine, or the
      // one already locked in today on another device), and I show that.
      const res = await fetchWithAuth('/api/daily-pick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tmdbId: result.id, mediaType: result.id.startsWith('tmdb-tv-') ? 'SHOW' : 'MOVIE' }),
      });
      const json = res.ok ? await res.json() : null;
      const authoritativeId = (json?.data as { tmdbId: string } | null)?.tmdbId ?? result.id;
      await showPick(authoritativeId);
    } catch {
      await showPick(result.id);
    }
    setGenerating(false);
  };

  // ── Revealed movie: poster-forward card (backdrop as a soft backing when it
  //    exists; the poster always shows, so unreleased films aren't a grey box) ──
  if (movie) {
    return (
      <section className="px-6 pt-6">
        <div className="relative rounded-[2.5rem] overflow-hidden shadow-2xl border border-border">
          {movie.backdrop && <Image src={movie.backdrop} alt="" fill className="object-cover opacity-25" />}
          <div className="relative bg-gradient-to-t from-background via-background/85 to-background/60 p-5 flex gap-5">
            <Link href={`/movie/${movie.id}`} className="w-28 shrink-0 aspect-[2/3] rounded-2xl overflow-hidden shadow-xl bg-muted">
              {movie.poster
                ? <Image src={movie.poster} alt={movie.title} width={112} height={168} className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center"><Film className="h-8 w-8 text-primary/60" /></div>}
            </Link>
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-2.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="bg-primary text-primary-foreground px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-widest">Today&apos;s Pick</span>
                <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground border border-border px-2 py-0.5 rounded-full">
                  <Bookmark className="h-3 w-3" /> Watchlist
                </span>
              </div>
              <h1 className="text-2xl font-headline font-bold leading-tight line-clamp-2">{movie.title}</h1>
              <div className="flex items-center gap-3 text-sm text-muted-foreground font-bold">
                {movie.year && <span>{movie.year}</span>}
                {movie.rating > 0 && <span className="flex items-center gap-1 text-accent"><Star className="h-4 w-4 fill-current" />{movie.rating.toFixed(1)}</span>}
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button asChild className="rounded-full h-10 px-5 bg-accent hover:bg-accent/90 text-white font-bold">
                  <Link href={`/movie/${movie.id}`}><Play className="h-4 w-4 mr-1.5 fill-current" /> Watch</Link>
                </Button>
                <Button asChild variant="outline" className="rounded-full h-10 px-5 border-border font-bold">
                  <Link href={`/movie/${movie.id}`}><Info className="h-4 w-4 mr-1.5" /> Details</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  // ── Compact banner (default / guest prompt / empty watchlist / initializing) ──
  return (
    <section className="px-6 pt-6">
      <div className="rounded-[2.5rem] border border-primary/20 bg-gradient-to-br from-primary/10 to-accent/5 p-8 flex flex-col items-center text-center gap-4">
        <div className="h-16 w-16 rounded-2xl bg-primary/15 border border-primary/25 flex items-center justify-center">
          <Sparkles className="h-8 w-8 text-primary" />
        </div>

        {guestPrompt ? (
          <>
            <div className="space-y-1">
              <h2 className="text-xl font-headline font-bold">Your pick is one tap away</h2>
              <p className="text-sm text-muted-foreground max-w-md">Create a free account, build a watchlist, and every day we&apos;ll pick one film for you to actually watch.</p>
            </div>
            <div className="flex gap-2">
              <Button asChild className="rounded-full h-11 px-6 font-bold"><Link href="/signup">Create free account</Link></Button>
              <Button asChild variant="outline" className="rounded-full h-11 px-5 font-bold border-border"><Link href="/login">Log in</Link></Button>
            </div>
          </>
        ) : emptyWatchlist ? (
          <>
            <div className="space-y-1">
              <h2 className="text-xl font-headline font-bold">Nothing to pick yet</h2>
              <p className="text-sm text-muted-foreground max-w-md">Add some released movies to your watchlist, then generate a pick to watch tonight.</p>
            </div>
            <Button asChild className="rounded-full h-11 px-6 font-bold"><Link href="/browse">Browse movies</Link></Button>
          </>
        ) : allRecent ? (
          <>
            <div className="space-y-1">
              <h2 className="text-xl font-headline font-bold">You&apos;ve had them all recently</h2>
              <p className="text-sm text-muted-foreground max-w-md">Every film on your watchlist has come up as a pick in the last couple of weeks. Add a few more and we&apos;ll have something new for you.</p>
            </div>
            <Button asChild className="rounded-full h-11 px-6 font-bold"><Link href="/browse">Browse movies</Link></Button>
          </>
        ) : noReleased ? (
          <>
            <div className="space-y-1">
              <h2 className="text-xl font-headline font-bold">Nothing out yet</h2>
              <p className="text-sm text-muted-foreground max-w-md">None of the films on your watchlist have been released yet — add some out-now titles and generate again.</p>
            </div>
            <Button asChild className="rounded-full h-11 px-6 font-bold"><Link href="/browse">Browse movies</Link></Button>
          </>
        ) : (
          <>
            <div className="space-y-1">
              <h2 className="text-xl font-headline font-bold">Today&apos;s Pick</h2>
              <p className="text-sm text-muted-foreground max-w-md">Stop scrolling your watchlist — let us pick one film for you to watch today.</p>
            </div>
            <Button onClick={generate} disabled={generating || initializing} className="rounded-full h-12 px-8 font-bold text-base">
              {generating || initializing ? <Loader2 className="h-5 w-5 animate-spin" /> : <><Sparkles className="h-5 w-5 mr-2" /> Generate</>}
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
