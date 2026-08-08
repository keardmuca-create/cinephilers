"use client"

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Info, Star, Bookmark, Sparkles, Loader2, Film, Check, Lock, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Movie } from '@/lib/types';
import { useAuth } from '@/contexts/auth-context';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { seededShuffle, DAY_MS } from '@/lib/seed-shuffle';
import { batchFetchMeta } from '@/lib/meta-batch';
import { isEpisodeId, getAddedAt } from '@/lib/media-id';
import { appendWatchLog } from '@/lib/watch-log';
import { toast } from '@/hooks/use-toast';
import { TodaysPickHelp } from '@/components/todays-pick-help';

// Stable per-day seed so the pick can't be rerolled — same movie all day,
// a new one tomorrow.
function daySeed(): number {
  const n = new Date();
  return n.getFullYear() * 10000 + (n.getMonth() + 1) * 100 + n.getDate();
}

// One line a day on the Generate banner. Seven of them, but the order is
// reshuffled every week — indexing a 7-item list by day number would pin each
// line to a weekday forever (Monday always the same joke).
const TAGLINES = [
  "We both know you'll scroll for an hour. Let's skip that part.",
  "Your watchlist isn't a museum. Let's actually watch something.",
  "You'll spend longer choosing than the film runs. Let us pick.",
  "That watchlist isn't going to watch itself.",
  'Nobody has ever reached the bottom of a watchlist.',
  "Somewhere in that list is tonight's film. Let's go find it.",
  "Choosing is the hard part. We'll handle that bit.",
];

function dayOfYear(): number {
  const n = new Date();
  return Math.floor(
    (Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()) - Date.UTC(n.getUTCFullYear(), 0, 1)) / DAY_MS
  );
}

// Shifting the index by the week number as well as the day means the sequence
// advances one extra step each week: every line appears once a week, never on
// two days running, and seven consecutive Mondays get seven different lines.
function taglineOfDay(): string {
  const d = dayOfYear();
  return TAGLINES[(d + Math.floor(d / TAGLINES.length)) % TAGLINES.length];
}

// ── Why this film ─────────────────────────────────────────────────────────────
// A true detail about the pick, never an invented reason (the pick is random).
// Which KIND of fact we lead with rotates daily, and each kind has three
// phrasings, so it rarely reads the same two days running — but a fact is only
// used when it genuinely holds for that film.

function runtimeFact(mins: number, v: number): string {
  const h = Math.floor(mins / 60), m = mins % 60;
  const t = h ? `${h}h ${m}m` : `${m}m`;
  if (mins <= 100) return [`${t} — you've got time tonight`, `Short one tonight. ${t}.`, `${t}. Done before bed.`][v];
  if (mins <= 150) return [`${t} — a proper evening`, `${t}. Settle in.`, `Give it ${t} tonight.`][v];
  return [`${t} — clear your evening`, `${t}. A commitment, but that's the point.`, `Big one: ${t}.`][v];
}

function waitingFact(addedAt: number, v: number): string | null {
  if (!addedAt) return null;
  const days = Math.floor((Date.now() - addedAt) / DAY_MS);
  if (days < 7) return null; // too recent to be worth mentioning
  const span = days < 30
    ? `${Math.floor(days / 7)} week${days < 14 ? '' : 's'}`
    : days < 365
      ? `${Math.floor(days / 30)} month${days < 60 ? '' : 's'}`
      : 'over a year';
  return [`On your watchlist for ${span}`, `You saved this ${span} ago — still waiting`, `${span} on your list. Tonight?`][v];
}

function friendsFact(friends: { name: string; rating: number }[], v: number): string | null {
  if (friends.length === 0) return null;
  if (friends.length === 1) {
    const f = friends[0];
    return [`${f.name} rated this ${f.rating}`, `${f.name} gave this a ${f.rating}`, `Your friend ${f.name} liked it — ${f.rating}/10`][v];
  }
  const avg = friends.reduce((s, f) => s + f.rating, 0) / friends.length;
  const n = friends.length;
  return [`${n} friends rated this ${avg.toFixed(1)}`, `${n} of your friends have seen this`, `Your friends gave this ${avg.toFixed(1)}`][v];
}

// Every unwatched film sitting on the watchlist. Read straight from local state,
// so the banner can say how big the deck is without waiting on a round trip.
function watchlistFilmIds(): string[] {
  const ids: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith('watchlist-')) continue;
      const id = k.slice('watchlist-'.length);
      if (localStorage.getItem(`watched-${id}`) === 'true') continue;
      if (isEpisodeId(id)) continue;
      ids.push(id);
    }
  } catch { /* ignore */ }
  return ids;
}

// How many poster columns fill the banner background. Ten is enough to cover a
// desktop card edge to edge without any one of them being wide enough to read as
// a poster you could tap.
const WALL_TILES = 10;

// The corner button that opens the explainer. Sits on both faces of the section —
// the banner and the revealed card — because either one can be somebody's first
// sight of the feature.
function HelpButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="How Today's Pick works"
      className="absolute top-3 right-3 z-10 h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
    >
      <MoreHorizontal className="h-5 w-5" />
    </button>
  );
}

// Time left until the pick rolls over, in the same words a person would use.
//
// Counted to the NEXT UTC MIDNIGHT, because that is when the pick actually
// changes: the server keys a pick to `new Date().toISOString().slice(0,10)`, a
// UTC day. This counted to the device's local midnight, so anyone east of
// Greenwich watched it reach zero and then got the same film back for hours.
// If the reset is ever moved to the user's own day, this has to move with it.
function untilTomorrow(): string {
  const now = new Date();
  const nextUtcMidnight = Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1,
  );
  const mins = Math.max(0, Math.round((nextUtcMidnight - now.getTime()) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// The day's pick from the watchlist: released, not yet watched, deterministic.
type PickResult = { id: string } | 'empty-list' | 'none-released' | 'all-recent';

async function pickWatchlistId(recentIds: string[] = []): Promise<PickResult> {
  const ids = watchlistFilmIds();
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
  // Picked after mount, never during render — the server and the browser can
  // sit on different sides of midnight, and a mismatch breaks hydration.
  const [tagline, setTagline] = useState(TAGLINES[0]);
  const [pickFact, setPickFact] = useState<string | null>(null);
  useEffect(() => { setTagline(taglineOfDay()); }, []);

  // Two different sets of posters, on purpose.
  //
  // `deckPosters` is a sample of the user's own watchlist and feeds the shuffle
  // window during a roll — flicking through the actual candidates is the part
  // that means something.
  //
  // `wallPosters` is the background, and it is deliberately NOT the watchlist. A
  // watchlist of two tiled across a wide card just reads as the same poster
  // repeated, which is wallpaper rather than atmosphere. This comes from the
  // shared home pool instead: many different popular titles, so the backdrop is
  // a wall of varied artwork.
  const [deckPosters, setDeckPosters] = useState<string[]>([]);
  const [wallPosters, setWallPosters] = useState<string[]>([]);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Already fetched by the home screen and cached for an hour, so this is not a
    // new round trip in practice.
    fetch('/api/home-pool')
      .then(r => r.ok ? r.json() : null)
      .then((pool: { daily?: Movie[]; weekly?: Movie[] } | null) => {
        if (cancelled || !pool) return;
        const posters = [...(pool.daily ?? []), ...(pool.weekly ?? [])]
          .map(m => m.poster)
          .filter((p): p is string => !!p);
        const unique = [...new Set(posters)];
        // Shuffled by the day so the wall is a different set each morning but
        // holds still while someone is looking at it.
        setWallPosters(seededShuffle(unique, daySeed()).slice(0, WALL_TILES));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  // Which poster the shuffle is currently on. -1 means the shuffle isn't running.
  const [shuffleAt, setShuffleAt] = useState(-1);
  const [marking, setMarking] = useState(false);
  const [markedWatched, setMarkedWatched] = useState(false);
  const [rollover, setRollover] = useState('');

  useEffect(() => {
    if (!user) return;
    const ids = watchlistFilmIds();
    if (ids.length === 0) return;
    // A sample, not the whole list — this is a backdrop, and the ids are already
    // in the shared meta batch, so it costs nothing beyond what the page fetches.
    let cancelled = false;
    batchFetchMeta(seededShuffle(ids.slice().sort(), daySeed()).slice(0, 8))
      .then(map => {
        if (cancelled) return;
        setDeckPosters(Object.values(map).map(m => m?.poster).filter((p): p is string => !!p));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user]);

  // Countdown on the locked card, ticking once a minute.
  useEffect(() => {
    if (!movie) return;
    setRollover(untilTomorrow());
    const t = setInterval(() => setRollover(untilTomorrow()), 60_000);
    return () => clearInterval(t);
  }, [movie]);

  // The roll should look like a roll. Flicking through real posters from the
  // user's own watchlist while the request is in flight turns a spinner into the
  // thing it is actually doing — and they are already loaded, so it costs nothing.
  useEffect(() => {
    if (!generating || deckPosters.length === 0) { setShuffleAt(-1); return; }
    let i = 0;
    setShuffleAt(0);
    const t = setInterval(() => { i = (i + 1) % deckPosters.length; setShuffleAt(i); }, 110);
    return () => clearInterval(t);
  }, [generating, deckPosters]);

  // Lead with a different KIND of fact each day, but only ever show one that's
  // actually true for this film — falling through to the next kind otherwise.
  const loadFact = async (tmdbId: string, m: Movie) => {
    let friends: { name: string; rating: number }[] = [];
    try {
      const res = await fetchWithAuth(`/api/movies/friends-ratings?tmdbId=${encodeURIComponent(tmdbId)}`);
      if (res.ok) {
        const j = await res.json();
        friends = (j.data ?? [])
          .filter((e: { rating: number | null }) => e.rating != null)
          .map((e: { user: { username: string; displayName: string | null }; rating: number }) => ({
            name: e.user.displayName ?? e.user.username,
            rating: e.rating,
          }));
      }
    } catch { /* ignore — the other facts still work */ }

    const d = dayOfYear();
    const v = Math.floor(d / 3) % 3; // which phrasing
    const lead = d % 3;              // which kind leads today
    const kinds = [
      () => friendsFact(friends, v),
      () => waitingFact(getAddedAt(tmdbId), v),
      () => (m.runtime ? runtimeFact(m.runtime, v) : null),
    ];
    for (let i = 0; i < kinds.length; i++) {
      const fact = kinds[(lead + i) % kinds.length]();
      if (fact) { setPickFact(fact); return; }
    }
    setPickFact(null);
  };

  const showPick = async (tmdbId: string) => {
    try {
      const r = await fetch(`/api/movies/${tmdbId}`);
      const m = await r.json();
      if (m && !m.error) {
        setMovie(m as Movie);
        try { setMarkedWatched(localStorage.getItem(`watched-${tmdbId}`) === 'true'); } catch { /* ignore */ }
        loadFact(tmdbId, m as Movie);
      }
    } catch { /* ignore */ }
  };

  // The pick's second button. It used to be "Watch", which went to the same page
  // as "Details" — two buttons, one destination, and neither of them did
  // anything. Marking it off is the action the card was missing: the whole point
  // of the pick is the film getting watched.
  //
  // Server first, local state after. A fire-and-forget write that quietly fails
  // leaves the database and the device disagreeing, and the next sync undoes it —
  // the same rule the film page follows.
  const markWatched = async () => {
    if (!movie || marking || markedWatched) return;
    setMarking(true);
    try {
      const res = await fetchWithAuth('/api/watched', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tmdbId: movie.id, mediaType: 'MOVIE' }),
      });
      if (!res.ok) throw new Error(String(res.status));
      try { localStorage.setItem(`watched-${movie.id}`, 'true'); } catch { /* ignore */ }
      appendWatchLog({
        id: movie.id,
        type: 'movie',
        genre: movie.genre ?? '',
        language: movie.originalLanguage ?? '',
      });
      setMarkedWatched(true);
      toast({ title: `Marked ${movie.title} as watched` });
    } catch {
      toast({ title: "Couldn't mark as watched. Check your connection and try again.", variant: 'destructive' });
    } finally {
      setMarking(false);
    }
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
          <HelpButton onOpen={() => setHelpOpen(true)} />
          <TodaysPickHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
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
              {pickFact && (
                <p className="flex items-center gap-1.5 text-xs text-primary font-semibold">
                  <Sparkles className="h-3.5 w-3.5 shrink-0" />{pickFact}
                </p>
              )}
              {/* Says out loud that the pick is settled — it can't be rerolled,
                  and a card that doesn't say so just looks like a button that
                  stopped working. */}
              {rollover && (
                <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-semibold">
                  <Lock className="h-3 w-3 shrink-0" />
                  Locked in for today · new pick in {rollover}
                </p>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                {/* Films only. A series keeps no watched record of its own — its
                    episodes are the record — so offering one button that means
                    two different things would put them back out of step. */}
                {movie.type !== 'show' && (
                  <Button
                    onClick={markWatched}
                    disabled={marking || markedWatched}
                    className="rounded-full h-10 px-5 bg-accent hover:bg-accent/90 text-white font-bold disabled:opacity-100"
                  >
                    {marking
                      ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                      : <Check className="h-4 w-4 mr-1.5" />}
                    {markedWatched ? 'Watched' : 'Mark as watched'}
                  </Button>
                )}
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
  const showWall = wallPosters.length > 0;

  return (
    <section className="px-6 pt-6">
      <div className="relative overflow-hidden rounded-[2.5rem] border border-primary/20 bg-gradient-to-br from-primary/10 to-accent/5 p-8 flex flex-col items-center text-center gap-4">
        <HelpButton onOpen={() => setHelpOpen(true)} />
        <TodaysPickHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
        {/* A wall of poster artwork behind the button, instead of an empty
            gradient. Ten different titles, edge to edge and each column flexing,
            so it is full and varied at any width — an earlier version tiled the
            user's own watchlist and a short list read as one poster repeated.
            Blurred and washed back so it stays atmosphere rather than a row
            someone might try to tap. A flat wash, not a vertical gradient, so
            the bottom corners aren't darker than the top. */}
        {showWall && (
          <div aria-hidden className="absolute inset-0 pointer-events-none select-none">
            <div className="absolute inset-0 flex blur-[7px] opacity-45 scale-105">
              {wallPosters.map((p, i) => (
                <div key={`${p}-${i}`} className="relative h-full flex-1 min-w-0">
                  <Image src={p} alt="" fill className="object-cover" sizes="20vw" />
                </div>
              ))}
            </div>
            <div className="absolute inset-0 bg-background/70" />
          </div>
        )}

        {/* While the roll is in flight this window flicks through those same
            posters, so the wait shows what it is doing instead of spinning. */}
        <div className="relative h-16 w-16 rounded-2xl bg-primary/15 border border-primary/25 flex items-center justify-center overflow-hidden shrink-0">
          {shuffleAt >= 0 && deckPosters[shuffleAt] ? (
            <Image src={deckPosters[shuffleAt]} alt="" fill className="object-cover" sizes="64px" />
          ) : (
            <Sparkles className="h-8 w-8 text-primary" />
          )}
        </div>

        {guestPrompt ? (
          <>
            <div className="space-y-1 relative">
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
            <div className="space-y-1 relative">
              <h2 className="text-xl font-headline font-bold">Nothing to pick yet</h2>
              <p className="text-sm text-muted-foreground max-w-md">Add some released movies to your watchlist, then generate a pick to watch tonight.</p>
            </div>
            <Button asChild className="rounded-full h-11 px-6 font-bold"><Link href="/browse">Browse movies</Link></Button>
          </>
        ) : allRecent ? (
          <>
            <div className="space-y-1 relative">
              <h2 className="text-xl font-headline font-bold">You&apos;ve had them all recently</h2>
              <p className="text-sm text-muted-foreground max-w-md">Every film on your watchlist has come up as a pick in the last couple of weeks. Add a few more and we&apos;ll have something new for you.</p>
            </div>
            <Button asChild className="rounded-full h-11 px-6 font-bold"><Link href="/browse">Browse movies</Link></Button>
          </>
        ) : noReleased ? (
          <>
            <div className="space-y-1 relative">
              <h2 className="text-xl font-headline font-bold">Nothing out yet</h2>
              <p className="text-sm text-muted-foreground max-w-md">None of the films on your watchlist have been released yet — add some out-now titles and generate again.</p>
            </div>
            <Button asChild className="rounded-full h-11 px-6 font-bold"><Link href="/browse">Browse movies</Link></Button>
          </>
        ) : (
          <>
            <div className="space-y-1 relative">
              <h2 className="text-xl font-headline font-bold">Today&apos;s Pick</h2>
              <p className="text-sm text-muted-foreground max-w-md">{tagline}</p>
              {/* The line that said "one film from your 21 · one has been waiting
                  1 months" is gone. Keard's read: it gives the game away before
                  the reveal, and the reveal is the point. The poster wall behind
                  the button already says the deck is yours without counting it
                  out loud. */}
            </div>
            <Button onClick={generate} disabled={generating || initializing} className="relative rounded-full h-12 px-8 font-bold text-base">
              {generating || initializing ? <Loader2 className="h-5 w-5 animate-spin" /> : <><Sparkles className="h-5 w-5 mr-2" /> Generate</>}
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
