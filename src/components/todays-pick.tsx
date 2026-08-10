"use client"

import React, { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Star, Sparkles, Loader2, Film, Check, Lock, MoreHorizontal } from 'lucide-react';
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

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// The reel's timing, in one place so the shape of it is readable.
//
// Fast enough at the start that no individual poster registers, then five steps
// of easing where they begin to resolve, then a pause and one last move. Roughly
// 2.1s in total — long enough to be an event, short enough that a daily ritual
// doesn't become a toll. The floor matters more than the number: the reel plays
// out even when the answer came back in 200ms, so the moment is the same length
// on every connection.
const ROLL_FAST_MS = 70;
const ROLL_FAST_MIN_MS = 770;
const ROLL_EASE_MS = [95, 125, 165, 215, 280];
const NUDGE_PAUSE_MS = 200;
const NUDGE_HOLD_MS = 260;
// A request that never answers still has to end in a landing rather than a reel
// that spins for the rest of the session.
const ROLL_SPIN_CAP_MS = 6000;
// What the wait costs when there are no posters to flick through.
const ROLL_TOTAL_MS =
  ROLL_FAST_MIN_MS +
  ROLL_EASE_MS.reduce((a, b) => a + b, 0) +
  NUDGE_PAUSE_MS + NUDGE_HOLD_MS;

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

// Nobody is named, however few of them there are.
//
// The single-friend case used to print a display name. Keard's call to drop it:
// "1 friend rated it 10" makes you want to open the title and find out who, and
// the name is waiting for you there. It also removes the only unbounded string on
// the card — a display name can be fifty characters, which was enough to push the
// sentence past two lines and cut the rating off the end of it — and it collapses
// what were two branches with six phrasings into one with three.
// No average, and never more than one score.
//
// People rate in whole numbers, so the mean of several ratings is a score nobody
// could have given — "5 friends rated this 8.2" reads as a bug, not a fact. With
// more than one friend the count is the interesting part anyway; the scores
// themselves are on the film's page. A single friend's rating IS a real number
// someone chose, so that one is still worth printing.
function friendsFact(friends: { name: string; rating: number }[], v: number): string | null {
  const n = friends.length;
  if (n === 0) return null;
  if (n === 1) {
    const score = String(friends[0].rating);
    return [`1 friend rated this ${score}`, '1 of your friends has seen this', `A friend gave this ${score}`][v];
  }
  return [
    `${n} of your friends rated this`,
    `${n} of your friends have seen this`,
    `${n} friends have rated this`,
  ][v];
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

// A dense mosaic rather than a row of large posters: many small tiles read as
// "cinema", a handful of big ones read as "some posters someone left here".
//
// Eight across, four down. Denser than the twenty-four it replaces, so the wall
// looks full, and cheaper with it — each tile is about a twelfth of the card's
// width, so w92 thumbnails are plenty and thirty-two of those weigh less than
// twenty-four w185s did. Finer than this and faces stop being recognisable,
// which is where a poster wall becomes confetti.
//
// Six rows. Tiles keep a poster's 2:3 shape, so the grid's height follows the
// section's WIDTH, not its height — eight columns on a phone makes each tile
// about 61px tall, and four rows of that left a bare strip of gradient across the
// bottom of a section half as tall again. Better to overshoot and let the last
// row clip: a wall that runs off the edge reads as a wall, and one that stops
// short reads as a mistake.
const WALL_COLS = 8;
const WALL_ROWS = 6;
const WALL_TILES = WALL_COLS * WALL_ROWS;

// Films Keard picked by name for the wall, plus the two series. Verified against
// TMDB rather than typed from memory — every id below resolved to the intended
// title with artwork present.
//
// He asked for IMDb's Top 250. There is no IMDb in this app and no free API for
// that list, so the rest of the wall is filled from TMDB's top-rated films
// instead: same idea, films huge numbers of people rated highly, and it overlaps
// heavily with the Top 250. The alternative — hardcoding 250 ids to mirror the
// list — would be wrong in places and would need hand-maintaining forever.
const PINNED_WALL_IDS = [
  'tmdb-2668',      // Sleepy Hollow (1999)
  'tmdb-22',        // Pirates of the Caribbean: The Curse of the Black Pearl
  'tmdb-297',       // Meet Joe Black
  'tmdb-438631',    // Dune
  'tmdb-693134',    // Dune: Part Two
  'tmdb-238',       // The Godfather
  'tmdb-278',       // The Shawshank Redemption
  'tmdb-tv-1396',   // Breaking Bad
  'tmdb-tv-1399',   // Game of Thrones
  'tmdb-11324',     // Shutter Island
  'tmdb-597',       // Titanic
  'tmdb-2832',      // Identity
];

// The wall itself, shared by both faces of the section. It used to live only on
// the pre-Generate banner, which meant the one state most people look at — the
// pick, already generated and locked for the day — never had it. Keard could not
// see the thing he had asked for because his pick was locked in.
function PosterWall({ posters }: { posters: string[] }) {
  if (posters.length === 0) return null;
  return (
    <div aria-hidden className="absolute inset-0 pointer-events-none select-none">
      {/* Each tile is 2:3 — a poster's own shape — so every poster is shown WHOLE.
          Stretching tiles to fill the box made them squares and cropped every
          poster to a slice of itself, and the point of using posters is that you
          can tell what they are. The grid runs past the bottom and is clipped
          there, which reads as a wall continuing behind the card. */}
      <div
        className="absolute inset-x-0 top-0 grid"
        style={{ gridTemplateColumns: `repeat(${WALL_COLS}, 1fr)` }}
      >
        {posters.map((p, i) => (
          <div key={`${p}-${i}`} className="relative aspect-[2/3]">
            {/* w92, TMDB's smallest. Each tile is about a twelfth of the card's
                width and images are served unoptimised, so the size named in the
                URL is the size downloaded. */}
            <Image src={p.replace(/\/w\d+\//, '/w92/')} alt="" fill className="object-cover" sizes="13vw" />
          </div>
        ))}
      </div>
      {/* Barely tinted. Earlier passes ran this at 80% and 45% and Keard's verdict
          both times was that you could hardly see the posters — which defeats the
          point of using them. The job is only to stop unrelated palettes clashing,
          not to turn them into a coloured rectangle. */}
      <div className="absolute inset-0 bg-primary/20 mix-blend-color" />
    </div>
  );
}

// The corner button that opens the explainer. Sits on both faces of the section —
// the banner and the revealed card — because either one can be somebody's first
// sight of the feature.
function HelpButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="How Today's Pick works"
      className="absolute top-1 right-1 z-10 h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
    >
      <MoreHorizontal className="h-5 w-5" />
    </button>
  );
}

// Time left until the pick rolls over, in the same words a person would use.
//
// Local midnight, and now that is also when the pick actually changes: the server
// works the day out from the IANA zone stored on the account, so this device's
// own midnight and the server's idea of "tomorrow" are the same moment. This
// briefly counted to UTC midnight, which was correct while the server keyed picks
// to a UTC day and wrong the instant that changed.
function untilTomorrow(): string {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  const mins = Math.max(0, Math.round((midnight - now.getTime()) / 60000));
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
    // Keard's picks always appear; the rest of the wall is top-rated films, so
    // every tile is something a viewer is likely to recognise. This used to draw
    // from the home pool, which is "popular THIS WEEK" — hence Chicago Fire and
    // NCIS turning up on a wall meant to say "cinema".
    //
    // Both sources are cached (meta for a day, top-rated on the CDN for an hour),
    // so in practice this is not two fresh round trips.
    Promise.all([
      batchFetchMeta(PINNED_WALL_IDS),
      fetch('/api/see-all/top-rated-movies')
        .then(r => (r.ok ? r.json() : null))
        .catch(() => null),
    ])
      .then(([metaMap, topRated]: [Record<string, { poster?: string } | null>, { items?: Movie[] } | null]) => {
        if (cancelled) return;
        const pinned = PINNED_WALL_IDS
          .map(id => metaMap[id]?.poster)
          .filter((p): p is string => !!p);
        const filler = (topRated?.items ?? [])
          .map(m => m.poster)
          .filter((p): p is string => !!p);

        // Pinned first so they survive the slice, then top-rated shuffled by the
        // day — a different wall each morning that holds still while you look at
        // it. Deduped in case a pinned film is also top-rated (Shawshank is).
        const unique = [...new Set([...pinned, ...seededShuffle(filler, daySeed())])];
        setWallPosters(unique.slice(0, WALL_TILES));
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
  //
  // It used to run at a flat 110ms for exactly as long as the network took, then
  // stop dead the instant the answer arrived. That reads as a cut, not a result.
  // A reel holds you with the SLOWDOWN — the moment you start being able to read
  // the posters — so the schedule below is fast, then eases out, then appears to
  // stop and moves one more time. That last nudge is the whole trick.
  const deckRef = useRef<string[]>([]);
  useEffect(() => { deckRef.current = deckPosters; }, [deckPosters]);
  // The poster the reel should come to rest on: the film you actually got. Set
  // by the fetch, read by the reel's final frame — whichever finishes first.
  const landingRef = useRef<string | null>(null);
  const [landed, setLanded] = useState<string | null>(null);

  // `ready` resolves when the pick is in hand. The reel spins until then — it is
  // the deceleration that has to be uninterrupted, not the whole animation, and a
  // reel that stops on time and then sits frozen waiting for the network is worse
  // than one that never stopped. So the fast phase is a floor AND a wait, and the
  // ease-out only begins once there is something to land on.
  const runRoll = async (ready: Promise<unknown>) => {
    let done = false;
    ready.then(() => { done = true; }, () => { done = true; });
    const deck = deckRef.current;
    // A tap per frame as it slows. Only on the easing steps: seventeen buzzes is
    // a phone malfunctioning, six is a reel ticking down. No-ops where the API
    // isn't supported, which includes iOS.
    const tick = () => { try { navigator.vibrate?.(8); } catch { /* ignore */ } };

    if (deck.length === 0) {
      const t0 = Date.now();
      while (!done && Date.now() - t0 < ROLL_SPIN_CAP_MS) await sleep(60);
      await sleep(Math.max(0, ROLL_TOTAL_MS - (Date.now() - t0)));
      return;
    }

    let i = 0;
    setLanded(null);
    setShuffleAt(0);
    const step = async (ms: number, buzz = false) => {
      i = (i + 1) % deck.length;
      setShuffleAt(i);
      if (buzz) tick();
      await sleep(ms);
    };

    // Fast for at least ROLL_FAST_MIN_MS, and beyond that for as long as the
    // request takes — capped, so a request that never answers still resolves into
    // a landing rather than spinning forever.
    const t0 = Date.now();
    do { await step(ROLL_FAST_MS); }
    while ((Date.now() - t0 < ROLL_FAST_MIN_MS || !done) && Date.now() - t0 < ROLL_SPIN_CAP_MS);

    for (const ms of ROLL_EASE_MS) await step(ms, true);

    // Looks stopped…
    await sleep(NUDGE_PAUSE_MS);
    // …and isn't. Land on the film itself if we already know it.
    if (landingRef.current) { setLanded(landingRef.current); tick(); }
    else await step(0, true);
    await sleep(NUDGE_HOLD_MS);
  };

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

  // Restoring today's already-locked pick on load, which appears immediately —
  // there is no roll to wait for, and animating a decision made hours ago would
  // be a lie. The reel's own path through this lives in generate().
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
    // Decide first, roll second. Rolling for two seconds and then saying "nothing
    // to pick" would spend the best moment in the app on a dead end.
    const result = await pickWatchlistId(recentIds);
    if (result === 'empty-list') { setEmptyWatchlist(true); setGenerating(false); return; }
    if (result === 'none-released') { setNoReleased(true); setGenerating(false); return; }
    if (result === 'all-recent') { setAllRecent(true); setGenerating(false); return; }

    // The reel and the request run together, and the reveal waits for whichever
    // takes longer. On a fast connection that is always the reel, which is the
    // point — the moment lasts the same on every device.
    landingRef.current = null;

    // Everything the reveal needs, as one promise the reel can watch.
    const pick = (async () => {
      let id = result.id;
      try {
        // Record my roll — the server returns the AUTHORITATIVE pick (mine, or the
        // one already locked in today on another device), and I show that.
        const res = await fetchWithAuth('/api/daily-pick', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tmdbId: result.id, mediaType: result.id.startsWith('tmdb-tv-') ? 'SHOW' : 'MOVIE' }),
        });
        const json = res.ok ? await res.json() : null;
        id = (json?.data as { tmdbId: string } | null)?.tmdbId ?? result.id;
      } catch { /* fall back to my own roll */ }

      const r = await fetch(`/api/movies/${id}`);
      const m = await r.json();
      const movie = m && !m.error ? (m as Movie) : null;
      // Told to the reel before it lands, so it comes to rest on the poster of the
      // film you actually got rather than whichever one it was showing.
      landingRef.current = movie?.poster ?? null;
      return { id, movie };
    })();

    const roll = runRoll(pick);
    const { id, movie: picked } = await pick.catch(() => ({ id: result.id, movie: null as Movie | null }));
    await roll;

    if (picked) {
      setMovie(picked);
      try { setMarkedWatched(localStorage.getItem(`watched-${id}`) === 'true'); } catch { /* ignore */ }
      loadFact(id, picked);
    }
    setGenerating(false);
    setLanded(null);
  };

  // ── Revealed movie: the same section as the banner, so the poster wall stays
  //    put when you press Generate. It used to swap in a different layout backed
  //    by the film's own backdrop, which meant the wall vanished at the exact
  //    moment most people are looking — and since a pick is locked for the day,
  //    that state is the one you see nearly all the time. ──
  if (movie) {
    return (
      <section className="px-6 pt-6">
        {/* Identical shell to the banner — same padding, same card width — so the
            wall shows exactly as much of itself before and after Generate. When
            this had its own tighter padding the card swelled to fill the section
            and the wall shrank to a hairline. */}
        {/* p-8, not px-8 py-9 — the extra vertical padding made the band of wall
            above and below four pixels thicker than the sides, which is small
            enough to look like a mistake rather than a choice. */}
        <div className="relative overflow-hidden rounded-[2.5rem] border border-primary/20 bg-gradient-to-br from-primary/10 to-accent/5 p-8 sm:p-12">
          <TodaysPickHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
          <PosterWall posters={wallPosters} />
          {/* Label, then the poster with the day's two facts beside it, then the
              title beneath, then one action. No "Watchlist" chip — where the pick
              comes from is the whole premise, so saying it on every card is
              telling people something they already know. And no Details button:
              the poster goes to the film's page, which is what a poster is for,
              and two buttons where one will do was the old card's problem. */}
          {/* w-full, not just max-w-sm. Without it the card sizes to its content
              and grows past the section, so the countdown and the button were
              sliced off at the right edge. */}
          {/* Tight on purpose. Keard's layout stacks the title, rating and button
              BELOW the poster where they used to sit beside it, which adds their
              height rather than hiding it alongside — the first pass came out 80px
              taller than the section had ever been. The poster, type sizes, gaps
              and button all give a little back so the section stays the size it
              was and only its contents changed. */}
          {/* The reveal gets a beat of its own. The reel lands, then the card
              arrives — without it the whole thing changes in one frame and the
              landing has nothing to land INTO. */}
          <div className="relative w-full mx-auto max-w-xs rounded-[1.6rem] bg-card border border-border/60 shadow-2xl p-3.5 flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-300">
            <HelpButton onOpen={() => setHelpOpen(true)} />

            <span className="self-start bg-primary text-primary-foreground px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-widest">
              Today&apos;s Pick
            </span>

            {/* Height pinned to the poster's, so the card is the same height
                whatever the pick's sentence says. Without this the sentence sets
                the card's height, and its longest form — a friend's rating, which
                carries a display name up to fifty characters — wraps to five or
                six lines and drags the whole section down with it. */}
            <div className="flex gap-4 h-[7.5rem]">
              {/* self-start is load-bearing. As a flex item this stretches to the
                  row's full height by default, which overrides aspect-[2/3] — so
                  object-cover cropped the poster into a tall strip. Aligning to
                  the top lets the aspect ratio decide the height again. */}
              <Link href={`/movie/${movie.id}`} className="w-20 shrink-0 self-start aspect-[2/3] rounded-xl overflow-hidden shadow-lg bg-muted">
                {movie.poster
                  ? <Image src={movie.poster} alt={movie.title} width={80} height={120} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center"><Film className="h-6 w-6 text-primary/60" /></div>}
              </Link>

              <div className="flex-1 min-w-0 h-full flex flex-col gap-1.5 overflow-hidden">
                {/* Says out loud that the pick is settled — it can't be rerolled,
                    and a card that doesn't say so just looks like a button that
                    stopped working. */}
                {rollover && (
                  <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground font-semibold">
                    <Lock className="h-3 w-3 shrink-0 mt-0.5" />
                    <span>New pick in {rollover}</span>
                  </p>
                )}
                {/* Order down this column: when the pick changes, then the film,
                    then why it was chosen. Title and score live here rather than
                    under the poster — two short lines beside a tall poster left an
                    obvious hole in the middle of the card, and this fills it while
                    making the card shorter. */}
                <div>
                  {/* Two lines at 16px, not one at 18px. A single line cut "The
                      Lord of the Rings: The Fellowship of the Ring" down to "The
                      Lord of t…", and long titles are not rare — franchises are
                      full of them. Still reads as the headline because it is bold
                      and dark above lighter grey. */}
                  <h1 className="text-base font-headline font-bold leading-tight line-clamp-2">{movie.title}</h1>
                  {/* Back on one line. Stacked, they used up the room a long
                      sentence needs — and side by side there is no star to knock
                      the year and the score out of line with each other. */}
                  <div className="flex items-center gap-3 text-base text-muted-foreground font-bold leading-snug">
                    {movie.year && <span>{movie.year}</span>}
                    {movie.rating > 0 && (
                      <span className="flex items-center gap-1 text-accent">
                        <Star className="h-4 w-4 fill-current" />{movie.rating.toFixed(1)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Takes whatever room is left and stops there. Two lines is what
                    the freed space holds; a longer sentence is cut rather than
                    allowed to grow the card. */}
                {pickFact && (
                  <p className="flex items-start gap-1.5 text-xs text-primary font-semibold min-h-0">
                    <Sparkles className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span className="line-clamp-2">{pickFact}</span>
                  </p>
                )}
              </div>
            </div>

            {/* Films only. A series keeps no watched record of its own — its
                episodes are the record — so offering one button that means two
                different things would put them back out of step. */}
            {movie.type !== 'show' && (
              <Button
                onClick={markWatched}
                disabled={marking || markedWatched}
                className="w-full rounded-full h-10 text-sm bg-accent hover:bg-accent/90 text-white font-bold disabled:opacity-100"
              >
                {marking
                  ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  : <Check className="h-4 w-4 mr-1.5" />}
                {markedWatched ? 'Watched' : 'Mark as watched'}
              </Button>
            )}
          </div>
        </div>
      </section>
    );
  }

  // ── Compact banner (default / guest prompt / empty watchlist / initializing) ──
  return (
    <section className="px-6 pt-6">
      {/* The section keeps its height. What changed is the split: the card gives
          up padding and width, and the wall gets it — so more posters show
          without the banner taking more of the screen. */}
      <div className="relative overflow-hidden rounded-[2.5rem] border border-primary/20 bg-gradient-to-br from-primary/10 to-accent/5 px-8 py-9 sm:px-12 sm:py-10">
        <TodaysPickHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
        <PosterWall posters={wallPosters} />

        {/* Everything readable sits on its own panel above the mosaic. This is
            the part that makes the poster wall work: text laid straight onto
            twenty-four posters is legible over some tiles and not others, and
            which ones changes daily. The panel is opaque enough to be certain
            rather than lucky. */}
        <div className="relative mx-auto max-w-xs rounded-[1.6rem] bg-card border border-border/60 shadow-2xl p-5 flex flex-col items-center text-center gap-3">
        {/* On the card, not the mosaic — a grey glyph over twenty-four posters is
            invisible at some scroll positions and merely hard to see at the rest. */}
        <HelpButton onOpen={() => setHelpOpen(true)} />

        {/* While the roll is in flight this window flicks through the watchlist's
            own posters, so the wait shows what it is doing instead of spinning.
            Shaped 2:3, because that is what goes in it — as a square it cropped
            every poster to a fragment, and the slot read as an icon badge rather
            than a place a film is about to appear. */}
        {/* The window grows a fraction on the last frame, so the reel doesn't
            just stop — it arrives. */}
        <div className={`relative w-20 aspect-[2/3] rounded-xl bg-primary/15 border flex items-center justify-center overflow-hidden shrink-0 transition-all duration-300 ${landed ? 'border-primary scale-105' : 'border-primary/25'}`}>
          {landed ? (
            <Image src={landed} alt="" fill className="object-cover" sizes="64px" />
          ) : shuffleAt >= 0 && deckPosters[shuffleAt] ? (
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
      </div>
    </section>
  );
}
