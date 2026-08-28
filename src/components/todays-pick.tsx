"use client"

import React, { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Star, Sparkles, Loader2, Film, Check, Lock, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Movie } from '@/lib/types';
import { useCommunityRatings } from '@/hooks/use-community-ratings';
import { resolveDisplayRating } from '@/lib/cinephilers-rating';
import { useAuth } from '@/contexts/auth-context';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { seededShuffle, DAY_MS } from '@/lib/seed-shuffle';
import { batchFetchMeta } from '@/lib/meta-batch';
import { isEpisodeId, isShowId, getAddedAt } from '@/lib/media-id';
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
// The banner and the revealed pick are two different JSX trees, and every time
// one of them was tuned the other drifted — which is how pressing Generate came
// to shrink the section by about ninety pixels. Shared here so the shell and the
// card cannot disagree again: whatever changes, both states change with it.
const PICK_SHELL =
  'relative overflow-hidden rounded-[2.5rem] border border-primary/20 bg-gradient-to-br from-primary/10 to-accent/5 px-8 py-9 sm:px-12 sm:py-10';
// One layout, two sets of contents. Both states are the same three slots in the
// same order — a 2:3 window, a fixed text box, one button — so nothing about the
// card can change when you press Generate: not its height, not the poster's
// position, not where the button sits.
//
// Every previous attempt at this pinned a height instead, and a pinned height
// only moves the problem: whichever state had less to say gained slack, the
// slack got centred, and the poster shifted anyway. Matching the STRUCTURE means
// there is no slack in either state to distribute.
const PICK_CARD_BASE = 'relative mx-auto max-w-xs rounded-[1.6rem] bg-card border border-border/60 shadow-2xl';
// Slot one. The reel spins here, and the poster lands here.
const PICK_SLOT = 'relative w-20 shrink-0 aspect-[2/3] rounded-xl overflow-hidden shadow-lg bg-muted flex items-center justify-center';
// Slot two. Fixed height, contents centred, sized for the busiest thing it ever
// holds — a two-line title with a countdown, a year, a score and a reason under
// it. A two-line title, a long fact or a missing year all change what this says
// without changing what it measures.
//
// The banner has less to put in it and is centred in the same box, so it carries
// a little air above and below its tagline. That air is in BOTH states, which is
// the point: an identical gap before and after is not something moving.
const PICK_TEXT = 'w-full h-[7.5rem] flex flex-col items-center justify-center gap-1 overflow-hidden';
// Slot three. Same height in both states — only the label and colour differ.
const PICK_BUTTON = 'w-full rounded-full h-12 font-bold text-base';

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

// Every unwatched FILM sitting on the watchlist. Read straight from local state,
// so the banner can say how big the deck is without waiting on a round trip.
//
// Films only, which is what this feature has always said it was — "every day
// we'll pick one film for you to actually watch". Episodes were already dropped;
// whole series were not, so a three-part documentary could win the day and be
// offered as tonight's film. A series is a different commitment from a film and
// picking one is not the promise being made.
function watchlistFilmIds(): string[] {
  const ids: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith('watchlist-')) continue;
      const id = k.slice('watchlist-'.length);
      if (localStorage.getItem(`watched-${id}`) === 'true') continue;
      if (isEpisodeId(id) || isShowId(id)) continue;
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
// Eight rows. Tiles keep a poster's 2:3 shape, so the grid's height follows the
// section's WIDTH, not its height — eight columns on a phone makes each tile
// about 61px tall, and the grid is anchored to the top, so any height the rows
// do not reach is left as bare gradient. Four rows did that once and six did it
// again the moment the card grew: 51px of empty pink under the wall.
//
// Eight covers the section with about seventy pixels to spare on a phone, so the
// card can grow a line without stranding a strip again. Overshooting is the safe
// direction — the last row simply clips, and a wall that runs off the edge reads
// as a wall continuing behind the card, while one that stops short reads as a
// mistake. Sixteen more w92 thumbnails is a few kilobytes.
const WALL_COLS = 8;
const WALL_ROWS = 8;
const WALL_TILES = WALL_COLS * WALL_ROWS;

// A FIXED wall: the same sixty-four titles every day, for everybody.
//
// It used to be Keard's twelve followed by TMDB's top-rated, reshuffled each
// morning by the date. Two things were wrong with that. The shuffle meant nobody
// could point at the app and say what it looks like — including Keard, who could
// not tell whether the wall was meant to change. And "top-rated" is not "famous":
// it surfaced Harakiri and Ikiru, superb films almost nobody recognises on sight,
// while the wall's whole job is to be recognised at a glance.
//
// So the rest is chosen by FAME rather than by score — the titles a stranger
// scrolling past would know without reading the name. That distinction matters:
// Titanic and Avengers have enormous audiences and middling scores; the reverse
// is just as common.
//
// Keard's twelve lead, unchanged and in his order. Fifty-five films and nine
// series in total, films first, which is the balance he asked for: television is
// first-class in this app, but a poster wall should still read as cinema.
//
// Every path below was resolved through the app's own /api/tmdb/search — title
// and year matched exactly, and each came back `confident`. None were typed from
// memory. Nothing is stored or re-hosted: TMDB serves these at w92, and a path
// that ever 404s costs one blank tile behind an opaque card.
const WALL_POSTERS = [
  // Keard's twelve, first and in order.
  '/1GuK965FLJxqUw9fd1pmvjbFAlv.jpg', // Sleepy Hollow (1999)
  '/poHwCZeWzJCShH7tOjg8RIoyjcw.jpg', // Pirates of the Caribbean: The Curse of the Black Pearl
  '/fDPAjvfPMomkKF7cMRmL5Anak61.jpg', // Meet Joe Black
  '/v1tRXZ4JtD2Iv6fjkPvT4GiwslV.jpg', // Dune
  '/6izwz7rsy95ARzTR3poZ8H6c5pp.jpg', // Dune: Part Two
  '/3bhkrj58Vtu7enYsRolD1fZdja1.jpg', // The Godfather
  '/9cqNxx0GxF0bflZmeSMuL5tnGzr.jpg', // The Shawshank Redemption
  '/anFx9aTOOYqgS3v7x3R84Kz67ly.jpg', // Breaking Bad
  '/37sTgAG9QardbdzCq51FoUw1Ijb.jpg', // Game of Thrones
  '/nrmXQ0zcZUL8jFLrakWc90IR8z9.jpg', // Shutter Island
  '/9xjZS2rlVxm8SFx8kPC3aIGCOYQ.jpg', // Titanic
  '/sYgimsiBywqVwJI8H4sETke8m7v.jpg', // Identity
  // The rest, by fame.
  '/gKY6q7SjCkAU6FqvqWybDYgUKIF.jpg', // Avatar
  '/ulzhLuWrPK07P1YkdWQLZnQh1JL.jpg', // Avengers: Endgame
  '/7WsyChQLEftFiDOVTGkv3hFpyyt.jpg', // Avengers: Infinity War
  '/qJ2tW6WMUDux911r6m7haRef0WH.jpg', // The Dark Knight
  '/xlaY2zyzMfkhk0HSC5VUwzoZPU1.jpg', // Inception
  '/yQvGrMoipbRoddT0ZR8tPoR7NfX.jpg', // Interstellar
  '/dXNAPwY7VrqMAo51EKhhCJfaGb5.jpg', // The Matrix
  '/Cw4hIUIAmSYfK9QfaUW5igp9La.jpg',  // Forrest Gump
  '/63viWuPfYQjRYLSZSZNq7dglJP5.jpg', // Jurassic Park
  '/fai0rspsNeJCS69wHNjOdWxcI7P.jpg', // Star Wars
  '/nNAeTmF4CtdSgMDplXTDPOpYzsX.jpg', // The Empire Strikes Back
  '/an0nD6uq6byfxXCfk6lQBzdL2J1.jpg', // E.T. the Extra-Terrestrial
  '/lxM6kqilAdpdhqUl2biYp5frUxE.jpg', // Jaws
  '/vN5B5WgYscRGcQpVhHl6p9DDTP0.jpg', // Back to the Future
  '/sKCr78MXSLixwmZ8DyJLrpMsd15.jpg', // The Lion King
  '/uXDfjJbdP4ijW5hWSBrPrlKpxab.jpg', // Toy Story
  '/eHuGQ10FUzK1mdOY69wF5pGgEf5.jpg', // Finding Nemo
  '/iB64vpL3dIObOtMZgX3RqdVdQDc.jpg', // Shrek
  '/itAKcobTYGpYT8Phwjd8c9hleTo.jpg', // Frozen
  '/wuMc08IPKEatf9rnMNXvIDxqP4W.jpg', // Harry Potter and the Philosopher's Stone
  '/6oom5QYQ2yQTMJIbnvbkBL9cHo6.jpg', // LOTR: The Fellowship of the Ring
  '/rCzpDGLbOoPwLjy3OAm5NUPOTrC.jpg', // LOTR: The Return of the King
  '/vQWk5YBFWF4bZaofAbv0tShwBvQ.jpg', // Pulp Fiction
  '/jSziioSwPVrOy9Yow3XhWIBDjq1.jpg', // Fight Club
  '/wN2xWp1eIwCKOD0BHTcErTBv1Uq.jpg', // Gladiator
  '/jFTVD4XoWQTcg7wdyJKa8PEds5q.jpg', // Terminator 2: Judgment Day
  '/xSI0dbKLDETwhiVUy6hGE8KXUln.jpg', // Rocky
  '/onTSipZ8R3bliBdKfPtsDuHTdlL.jpg', // Home Alone
  '/uS9m8OBk1A8eM9I042bx8XXpqAq.jpg', // The Silence of the Lambs
  '/191nKfP0ehp3uIvWqgPbFmI4lv9.jpg', // Se7en
  '/udDclJoHjfjb8Ekgsd4FDteOkCU.jpg', // Joker
  '/1g0dhYtq4irTY1GPXvft6k4YLjm.jpg', // Spider-Man: No Way Home
  '/78lPtwv72eTNqFW9COBYI0dWDJa.jpg', // Iron Man
  '/uxzzxijgPIY7slzFvMotPv8wjKA.jpg', // Black Panther
  '/kW9LmvYHAaS9iA0tHmZVq8hQYoq.jpg', // The Wolf of Wall Street
  '/7oWY8VDWW7thTzWh3OKYRkWUlD5.jpg', // Django Unchained
  '/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg', // Parasite
  '/8VG8fDNiy50H4FedGwdSVUPoaJe.jpg', // The Green Mile
  '/sF1U4EUQS8YHUYjNl3pMGNIQyr0.jpg', // Schindler's List
  '/uqx37cS8cpHg8U35f9U5IBlrCV3.jpg', // Saving Private Ryan
  '/d0IVecFQvsGdSbnMAHqiYsNYaJT.jpg', // Skyfall
  '/3E53WEZJqP6aM84D8CckXx4pIHw.jpg', // Deadpool
  '/n0YuM4f5lvGAP6MAW2kBIzugXnc.jpg', // Top Gun: Maverick
  '/iuFNMS8U5cb6xfzi51Dbkovj7vM.jpg', // Barbie
  '/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg', // Oppenheimer
  // The series.
  '/2koX1xLkpTQM4IZebYvKysFW1Nh.jpg', // Friends
  '/7DJKHzAi83BmQrWLrYYOqcoKfhR.jpg', // The Office
  '/uOOtwVbSr4QDjAGIifLDwpb2Pdl.jpg', // Stranger Things
  '/1QdXdRYfktUSONkl1oD5gc6Be0s.jpg', // Squid Game
  '/reEMJA1uzscCbkpeRJeTT2bjqUp.jpg', // Money Heist
  '/aN29llVoCFtBTwDZFtqdD9d8dHb.jpg', // The Walking Dead
  '/vUUqzWa2LnHIVqkaKVlVGkVcZIW.jpg', // Peaky Blinders
]
  // Capped at the grid's own size, so adding a favourite title to the list can
  // never quietly grow the wall past eight rows.
  .slice(0, WALL_TILES)
  .map(p => `https://image.tmdb.org/t/p/w92${p}`);

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
  // Declared up here with the other state so the render below can read it; the
  // hook needs an id that may not exist yet, which it handles as an empty list.
  const pickCine = useCommunityRatings([movie?.id]);
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
  const [helpOpen, setHelpOpen] = useState(false);

  // The wall is a constant now, so there is no state and no request behind it:
  // two fetches (pinned metadata, and the top-rated list) are gone from every
  // load of the home screen.
  const wallPosters = WALL_POSTERS;
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
        // Derived, not assumed. The pool is films only, so this should always
        // say MOVIE — but it used to say MOVIE unconditionally, and while shows
        // could still be picked that wrote a series into the watched table
        // labelled as a film, which groups wrongly everywhere media type is read.
        // The daily-pick call below has always derived it; these now agree.
        body: JSON.stringify({ tmdbId: movie.id, mediaType: movie.id.startsWith('tmdb-tv-') ? 'SHOW' : 'MOVIE' }),
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
        {/* Literally the same shell as the banner now, not a copy of it that has
            to be kept in step by hand. It had drifted to its own p-8 against the
            banner's px-8 py-9, which cost eight more pixels on top of the card's
            own shortfall. */}
        <div className={PICK_SHELL}>
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
          <div className={`${PICK_CARD_BASE} w-full p-5 flex flex-col items-center justify-center text-center gap-3 animate-in fade-in zoom-in-95 duration-300`}>
            <HelpButton onOpen={() => setHelpOpen(true)} />

            {/* Slot one of three, and the same element the reel was spinning in:
                same width, same shape, same position. */}
            <Link href={`/movie/${movie.id}`} className={PICK_SLOT}>
              {movie.poster
                ? <Image src={movie.poster} alt={movie.title} width={80} height={120} className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center"><Film className="h-6 w-6 text-primary/60" /></div>}
            </Link>

            {/* Slot two, the same fixed box the banner puts its heading and
                tagline in. Fixed, and centred inside, because that is what stops
                the card resizing: a two-line title, a long fact, a missing year —
                none of them can move the button or the poster. */}
            <div className={PICK_TEXT}>
              {/* Says out loud that the pick is settled — it can't be rerolled,
                  and a card that doesn't say so just looks like a button that
                  stopped working. */}
              {rollover && (
                <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-semibold">
                  <Lock className="h-3 w-3 shrink-0" />
                  <span>New pick in {rollover}</span>
                </p>
              )}
              <h2 className="text-xl font-headline font-bold leading-tight line-clamp-2">{movie.title}</h2>
              <p className="flex items-center justify-center gap-3 text-sm text-muted-foreground font-bold">
                {movie.year && <span>{movie.year}</span>}
                {(() => {
                  const shown = resolveDisplayRating(movie.rating, pickCine[movie.id]);
                  if (!shown) return null;
                  // Same rule as every other star in the app: a filled yellow star is
                  // TMDB's number, a filled crimson one is ours. This card was the last
                  // place still drawing TMDB's score in the accent colour, which is the
                  // colour that means community — and drawing it hollow, which is the
                  // colour that means one person's own score.
                  return (
                    <span className="flex items-center gap-1 text-foreground">
                      <Star className={`h-3.5 w-3.5 ${shown.source === 'cinephilers'
                        ? 'fill-primary text-primary'
                        : 'fill-yellow-400 text-yellow-400'}`} />
                      {shown.value.toFixed(1)}
                    </span>
                  );
                })()}
              </p>
              {pickFact && (
                <p className="flex items-start justify-center gap-1.5 text-xs text-primary font-semibold">
                  <Sparkles className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span className="line-clamp-1">{pickFact}</span>
                </p>
              )}
            </div>

            {/* Films only. A series keeps no watched record of its own — its
                episodes are the record — so offering one button that means two
                different things would put them back out of step. */}
            {movie.type !== 'show' && (
              <Button
                onClick={markWatched}
                disabled={marking || markedWatched}
                className={`${PICK_BUTTON} bg-accent hover:bg-accent/90 text-white disabled:opacity-100`}
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
      <div className={PICK_SHELL}>
        <TodaysPickHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
        <PosterWall posters={wallPosters} />

        {/* Everything readable sits on its own panel above the mosaic. This is
            the part that makes the poster wall work: text laid straight onto
            twenty-four posters is legible over some tiles and not others, and
            which ones changes daily. The panel is opaque enough to be certain
            rather than lucky. */}
        <div className={`${PICK_CARD_BASE} p-5 flex flex-col items-center justify-center text-center gap-3`}>
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
        <div className={`${PICK_SLOT} bg-primary/15 border transition-all duration-300 ${landed ? 'border-primary scale-105' : 'border-primary/25'}`}>
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
            {/* Slot two, the same box the revealed card puts the film in — the
                heading becomes the title and the tagline becomes the year, score
                and reason, and nothing moves because the box does not. */}
            <div className={PICK_TEXT}>
              <h2 className="text-xl font-headline font-bold leading-tight">Today&apos;s Pick</h2>
              {/* The line that said "one film from your 21 · one has been waiting
                  1 months" is gone. Keard's read: it gives the game away before
                  the reveal, and the reveal is the point. The poster wall behind
                  the button already says the deck is yours without counting it
                  out loud. */}
              <p className="text-sm text-muted-foreground line-clamp-2">{tagline}</p>
            </div>
            <Button onClick={generate} disabled={generating || initializing} className={`${PICK_BUTTON} relative`}>
              {generating || initializing ? <Loader2 className="h-5 w-5 animate-spin" /> : <><Sparkles className="h-5 w-5 mr-2" /> Generate</>}
            </Button>
          </>
        )}
        </div>
      </div>
    </section>
  );
}
