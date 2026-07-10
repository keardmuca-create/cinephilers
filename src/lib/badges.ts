
// Badge system — definitions, tier computation, localStorage helpers

import { recordAddedAt } from '@/lib/media-id';

export type BadgeTier = 'locked' | 'grey' | 'bronze' | 'silver' | 'gold';

export const TIER_COLORS: Record<BadgeTier, string> = {
  locked: '#374151',
  grey:   '#9ca3af',
  bronze: '#cd7f32',
  silver: '#c0c0c0',
  gold:   '#ffd700',
};

export const TIER_LABELS: Record<BadgeTier, string> = {
  locked: 'Locked',
  grey:   'Grey',
  bronze: 'Bronze',
  silver: 'Silver',
  gold:   'Gold',
};

export const TIER_ORDER: Record<BadgeTier, number> = {
  locked: 0, grey: 1, bronze: 2, silver: 3, gold: 4,
};

export type EarnedTier = 'grey' | 'bronze' | 'silver' | 'gold';
export const EARNED_TIERS: EarnedTier[] = ['grey', 'bronze', 'silver', 'gold'];

export interface TierThresholds {
  grey: number;
  bronze: number;
  silver: number;
  gold: number;
}

// ISO dates for when each tier was first reached
export type TierHistory = Partial<Record<EarnedTier, string>>;

export interface WatchEntry {
  id: string;
  type: 'movie' | 'episode';
  loggedAt: string;
  hour: number;
  genre: string;
  language: string;
  source?: 'import';  // bulk-imported entries are excluded from day/week marathon badges
}

interface SeasonalWindow {
  startMonth: number;
  startDay: number;
  endMonth: number;
  endDay: number;
  crossesNewYear?: boolean;
  genreKeyword?: string;
  label: string;
}

interface BadgeDefinition {
  id: string;
  name: string;
  description: string;
  unit: string;  // e.g. "movies watched", "reviews written"
  verb: string;  // e.g. "Watch", "Rate", "Write", "Follow"
  category: 'alltime' | 'seasonal' | 'special';
  tiers?: TierThresholds;
  statKey?: keyof UserStats;
  seasonal?: SeasonalWindow;
}

export interface UserStats {
  moviesWatched: number;
  moviesRated: number;
  episodesWatched: number;
  episodesRated: number;
  showsRated: number;
  reviewsWritten: number;
  maxMoviesInDay: number;
  maxMoviesInWeek: number;
  lateNightMovies: number;
  friendsFollowing: number;
  distinctLanguages: number;
  signupDate: string | null;
  halloweenCount: number;
  holidayCount: number;
  valentinesCount: number;
  newYearCount: number;
  summerCount: number;
}

export interface ComputedBadge {
  id: string;
  name: string;
  description: string;
  unit: string;
  verb: string;
  tier: BadgeTier;
  current: number;
  nextThreshold: number | null;
  progressPct: number;
  thresholds?: TierThresholds;
  tierHistory?: TierHistory;
  isSpecial: boolean;
  memberSince?: string;
  isSeasonal: boolean;
  seasonLabel?: string;
  seasonEndDate?: Date;
  seasonWindowText?: string; // e.g. "Oct 1 – Nov 1"
  isSeasonActive?: boolean;
  seasonEarnedYears?: number[];
}

// ─── Badge definitions ─────────────────────────────────────────────────────────

const BADGE_DEFS: BadgeDefinition[] = [
  {
    id: 'founder',
    name: 'Founder',
    description: 'Awarded to everyone who joins the community.',
    unit: '',
    verb: '',
    category: 'special',
  },
  {
    id: 'movie-watcher',
    name: 'Movie Watcher',
    description: 'Log the movies you watch to climb the ranks.',
    unit: 'movies watched',
    verb: 'Watch',
    category: 'alltime',
    statKey: 'moviesWatched',
    tiers: { grey: 1, bronze: 100, silver: 500, gold: 1000 },
  },
  {
    id: 'movie-rater',
    name: 'Movie Rater',
    description: 'Rate the movies you watch to show your taste.',
    unit: 'movies rated',
    verb: 'Rate',
    category: 'alltime',
    statKey: 'moviesRated',
    tiers: { grey: 1, bronze: 100, silver: 500, gold: 1000 },
  },
  {
    id: 'show-watcher',
    name: 'Show Watcher',
    description: 'Log the show episodes you watch to climb the ranks.',
    unit: 'episodes watched',
    verb: 'Watch',
    category: 'alltime',
    statKey: 'episodesWatched',
    tiers: { grey: 1, bronze: 100, silver: 500, gold: 1000 },
  },
  {
    id: 'show-rater',
    name: 'Show Rater',
    description: 'Rate the shows you watch to show your taste.',
    unit: 'shows rated',
    verb: 'Rate',
    category: 'alltime',
    statKey: 'showsRated',
    tiers: { grey: 1, bronze: 10, silver: 50, gold: 100 },
  },
  {
    id: 'reviewer',
    name: 'Reviewer',
    description: 'Write reviews to share your thoughts with the community.',
    unit: 'reviews written',
    verb: 'Write',
    category: 'alltime',
    statKey: 'reviewsWritten',
    tiers: { grey: 1, bronze: 10, silver: 100, gold: 250 },
  },
  {
    id: 'daily-marathon',
    name: 'Daily Marathon',
    description: 'Log multiple movies in a single day to earn this badge.',
    unit: 'movies in one day',
    verb: 'Watch',
    category: 'alltime',
    statKey: 'maxMoviesInDay',
    tiers: { grey: 1, bronze: 3, silver: 5, gold: 7 },
  },
  {
    id: 'weekly-watcher',
    name: 'Weekly Watcher',
    description: 'Log movies consistently every week to earn this badge.',
    unit: 'movies in one week',
    verb: 'Watch',
    category: 'alltime',
    statKey: 'maxMoviesInWeek',
    tiers: { grey: 1, bronze: 5, silver: 10, gold: 15 },
  },
  {
    id: 'night-owl',
    name: 'Night Owl',
    description: 'Log movies in the late hours of the night (12am–4am).',
    unit: 'late night logs',
    verb: 'Log',
    category: 'alltime',
    statKey: 'lateNightMovies',
    tiers: { grey: 1, bronze: 10, silver: 25, gold: 50 },
  },
  {
    id: 'social',
    name: 'Social',
    description: 'Follow other members of the community to earn this badge.',
    unit: 'friends followed',
    verb: 'Follow',
    category: 'alltime',
    statKey: 'friendsFollowing',
    tiers: { grey: 1, bronze: 10, silver: 50, gold: 100 },
  },
  {
    id: 'world-cinema',
    name: 'World Cinema',
    description: 'Watch films from different countries around the world.',
    unit: 'languages',
    verb: 'Watch films in',
    category: 'alltime',
    statKey: 'distinctLanguages',
    tiers: { grey: 5, bronze: 10, silver: 20, gold: 50 },
  },
  {
    id: 'halloween',
    name: 'Halloween Season',
    description: 'Watch horror films throughout October. Returns every year.',
    unit: 'horror films',
    verb: 'Watch',
    category: 'seasonal',
    statKey: 'halloweenCount',
    tiers: { grey: 3, bronze: 8, silver: 15, gold: 20 },
    seasonal: { startMonth: 10, startDay: 1, endMonth: 11, endDay: 1, genreKeyword: 'Horror', label: 'Halloween Season' },
  },
  {
    id: 'holiday',
    name: 'Holiday Season',
    description: 'Watch holiday films throughout December. Returns every year.',
    unit: 'holiday films',
    verb: 'Watch',
    category: 'seasonal',
    statKey: 'holidayCount',
    tiers: { grey: 3, bronze: 8, silver: 15, gold: 20 },
    seasonal: { startMonth: 12, startDay: 1, endMonth: 12, endDay: 26, genreKeyword: 'Family', label: 'Holiday Season' },
  },
  {
    id: 'valentines',
    name: "Valentine's Week",
    description: "Watch romance films during Valentine's week. Returns every year.",
    unit: 'romance films',
    verb: 'Watch',
    category: 'seasonal',
    statKey: 'valentinesCount',
    tiers: { grey: 2, bronze: 5, silver: 8, gold: 10 },
    seasonal: { startMonth: 2, startDay: 7, endMonth: 2, endDay: 15, genreKeyword: 'Romance', label: "Valentine's Week" },
  },
  {
    id: 'new-year',
    name: 'New Year Season',
    description: 'Watch films during the first week of the new year. Returns every year.',
    unit: 'films',
    verb: 'Watch',
    category: 'seasonal',
    statKey: 'newYearCount',
    tiers: { grey: 1, bronze: 3, silver: 5, gold: 7 },
    seasonal: { startMonth: 12, startDay: 31, endMonth: 1, endDay: 8, crossesNewYear: true, label: 'New Year Season' },
  },
  {
    id: 'summer',
    name: 'Summer Blockbuster',
    description: 'Watch films throughout the summer to earn this badge. Returns every year.',
    unit: 'films',
    verb: 'Watch',
    category: 'seasonal',
    statKey: 'summerCount',
    tiers: { grey: 20, bronze: 50, silver: 75, gold: 100 },
    seasonal: { startMonth: 6, startDay: 1, endMonth: 9, endDay: 1, label: 'Summer Blockbuster' },
  },
];

// ─── Tier helpers ──────────────────────────────────────────────────────────────

function computeTier(
  count: number,
  t: TierThresholds,
): { tier: BadgeTier; progressPct: number; nextThreshold: number | null } {
  if (count >= t.gold)   return { tier: 'gold',   progressPct: 100, nextThreshold: null };
  if (count >= t.silver) return { tier: 'silver', progressPct: ((count - t.silver) / (t.gold   - t.silver)) * 100, nextThreshold: t.gold };
  if (count >= t.bronze) return { tier: 'bronze', progressPct: ((count - t.bronze) / (t.silver - t.bronze)) * 100, nextThreshold: t.silver };
  if (count >= t.grey)   return { tier: 'grey',   progressPct: ((count - t.grey)   / (t.bronze - t.grey))   * 100, nextThreshold: t.bronze };
  return { tier: 'locked', progressPct: 0, nextThreshold: t.grey };
}

// ─── Seasonal window helpers ───────────────────────────────────────────────────

function seasonDates(s: SeasonalWindow, year: number): { start: Date; end: Date } {
  if (s.crossesNewYear) {
    return {
      start: new Date(year - 1, s.startMonth - 1, s.startDay, 0, 0, 0),
      end:   new Date(year,     s.endMonth   - 1, s.endDay,   0, 0, 0),
    };
  }
  return {
    start: new Date(year, s.startMonth - 1, s.startDay, 0, 0, 0),
    end:   new Date(year, s.endMonth   - 1, s.endDay,   0, 0, 0),
  };
}

function currentSeasonWindow(s: SeasonalWindow): { start: Date; end: Date; year: number } | null {
  const now = new Date();
  const y = now.getFullYear();
  for (const yr of [y, y + 1, y - 1]) {
    const { start, end } = seasonDates(s, yr);
    if (now >= start && now < end) return { start, end, year: yr };
  }
  return null;
}

function nextSeasonStart(s: SeasonalWindow): Date {
  const now = new Date();
  const y = now.getFullYear();
  for (const yr of [y, y + 1]) {
    const { start } = seasonDates(s, yr);
    if (start > now) return start;
  }
  return seasonDates(s, y + 1).start;
}

function formatSeasonWindow(s: SeasonalWindow, year: number): string {
  const { start, end } = seasonDates(s, year);
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(start)} – ${fmt(end)}`;
}

// ─── localStorage helpers ──────────────────────────────────────────────────────

function safeGetItem(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function safeParseJSON<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

// ─── Stats reader ──────────────────────────────────────────────────────────────

export function readUserStats(): UserStats {
  let moviesWatched = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      // Count real movies only: exclude episode keys (watched-ep-) and whole-show keys (watched-tmdb-tv-)
      if (key?.startsWith('watched-') && !key.startsWith('watched-ep-') && !key.startsWith('watched-tmdb-tv-') && localStorage.getItem(key) === 'true') {
        moviesWatched++;
      }
    }
  } catch { /* ignore */ }

  let moviesRated = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('movie-rating-')) moviesRated++;
    }
  } catch { /* ignore */ }

  let episodesRated = 0;
  let showsRated = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('episode-rating-')) episodesRated++;
      if (key?.startsWith('movie-rating-tmdb-tv-')) showsRated++;
    }
  } catch { /* ignore */ }

  // Episodes watched: individual ep keys + whole-show-watched credits
  let episodesWatched = 0;
  const showsWithIndividualEps = new Set<string>();
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key.startsWith('watched-ep-') && localStorage.getItem(key) === 'true') {
        episodesWatched++;
        // key format: watched-ep-tmdb-tv-{id}-S{n}E{n}
        // showId = everything between "watched-ep-" and the last "-S{n}E{n}" segment
        const m = key.match(/^watched-ep-(.+)-S\d+E\d+$/);
        if (m) showsWithIndividualEps.add(m[1]);
      }
    }
  } catch { /* ignore */ }
  // Add episode counts for shows marked as watched via the whole-show button,
  // but only if the user hasn't also tracked individual episodes for that show.
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith('watched-show-eps-')) continue;
      const showId = key.replace('watched-show-eps-', '');
      if (showsWithIndividualEps.has(showId)) continue;
      const count = parseInt(localStorage.getItem(key) ?? '0', 10);
      if (count > 0) episodesWatched += count;
    }
  } catch { /* ignore */ }

  const watchLog     = safeParseJSON<WatchEntry[]>(safeGetItem('watch-log'), []);
  const movieEntries = watchLog.filter(e => e.type === 'movie');
  const reviewsWritten   = parseInt(safeGetItem('review-count')    ?? '0', 10) || 0;
  const friendsFollowing = parseInt(safeGetItem('following-count') ?? '0', 10) || 0;
  const signupDate       = safeGetItem('signup-date');

  // Marathon/consistency badges reward real-time logging, so exclude bulk imports
  const loggedMovieEntries = movieEntries.filter(e => e.source !== 'import');

  const dayMap = new Map<string, number>();
  for (const e of loggedMovieEntries) {
    const day = e.loggedAt.slice(0, 10);
    dayMap.set(day, (dayMap.get(day) ?? 0) + 1);
  }
  const maxMoviesInDay = dayMap.size > 0 ? Math.max(...dayMap.values()) : 0;

  const weekMap = new Map<string, number>();
  for (const e of loggedMovieEntries) {
    const d = new Date(e.loggedAt);
    const mon = new Date(d);
    mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const wk = mon.toISOString().slice(0, 10);
    weekMap.set(wk, (weekMap.get(wk) ?? 0) + 1);
  }
  const maxMoviesInWeek = weekMap.size > 0 ? Math.max(...weekMap.values()) : 0;

  const lateNightMovies   = movieEntries.filter(e => e.hour >= 0 && e.hour < 4).length;

  // World Cinema: the login sync rebuilds the watch-log from the DB WITHOUT
  // languages (the DB doesn't store them), so log entries alone read 0 after
  // any re-login. Fall back to the meta-{id} cache, which carries the
  // original_language for every title the app has ever displayed.
  const languages = new Set<string>();
  for (const e of movieEntries) {
    if (e.language) { languages.add(e.language); continue; }
    try {
      const raw = localStorage.getItem(`meta-${e.id}`);
      if (raw) {
        const lang = (JSON.parse(raw) as { language?: string }).language;
        if (lang) languages.add(lang);
      }
    } catch { /* ignore */ }
  }
  const distinctLanguages = languages.size;

  const now = new Date();
  const y   = now.getFullYear();

  function countInWindow(s: SeasonalWindow, genreKeyword?: string): number {
    const win = currentSeasonWindow(s);
    const { start, end } = win ?? seasonDates(s, y);
    return movieEntries.filter(e => {
      const t = new Date(e.loggedAt);
      return t >= start && t < end && (!genreKeyword || e.genre?.includes(genreKeyword));
    }).length;
  }

  return {
    moviesWatched,
    moviesRated,
    episodesWatched,
    episodesRated,
    showsRated,
    reviewsWritten,
    maxMoviesInDay,
    maxMoviesInWeek,
    lateNightMovies,
    friendsFollowing,
    distinctLanguages,
    signupDate,
    halloweenCount:  countInWindow({ startMonth: 10, startDay: 1,  endMonth: 11, endDay: 1,  label: '' }, 'Horror'),
    holidayCount:    countInWindow({ startMonth: 12, startDay: 1,  endMonth: 12, endDay: 26, label: '' }, 'Family'),
    valentinesCount: countInWindow({ startMonth: 2,  startDay: 7,  endMonth: 2,  endDay: 15, label: '' }, 'Romance'),
    newYearCount:    countInWindow({ startMonth: 12, startDay: 31, endMonth: 1,  endDay: 8,  crossesNewYear: true, label: '' }),
    summerCount:     countInWindow({ startMonth: 6,  startDay: 1,  endMonth: 9,  endDay: 1,  label: '' }),
  };
}

// ─── Write helpers ─────────────────────────────────────────────────────────────

export function appendWatchLog(entry: {
  id: string; type: 'movie' | 'episode'; genre: string; language: string; loggedAt?: string;
}): void {
  try {
    const now = new Date();
    const log = safeParseJSON<WatchEntry[]>(safeGetItem('watch-log'), []);
    const newEntry: WatchEntry = { ...entry, loggedAt: entry.loggedAt ?? now.toISOString(), hour: now.getHours() };
    const filtered = log.filter(e => !(e.id === entry.id && e.type === entry.type));
    localStorage.setItem('watch-log', JSON.stringify([...filtered, newEntry]));
  } catch { /* ignore */ }
}

export function removeFromWatchLog(id: string, type: 'movie' | 'episode'): void {
  try {
    const log = safeParseJSON<WatchEntry[]>(safeGetItem('watch-log'), []);
    localStorage.setItem('watch-log', JSON.stringify(log.filter(e => !(e.id === id && e.type === type))));
  } catch { /* ignore */ }
}

export function saveMovieRating(id: string, rating: number): void {
  try { localStorage.setItem(`movie-rating-${id}`, String(rating)); } catch { /* ignore */ }
  recordAddedAt(id);
}

export function ensureSignupDate(): void {
  try {
    if (!localStorage.getItem('signup-date')) {
      localStorage.setItem('signup-date', new Date().toISOString());
    }
  } catch { /* ignore */ }
}

// ─── Tier history tracking ─────────────────────────────────────────────────────

function updateTierHistory(badgeId: string, currentTier: BadgeTier): TierHistory {
  const histKey  = `badge-tier-history-${badgeId}`;
  const lastKey  = `badge-last-tier-${badgeId}`;
  const history  = safeParseJSON<TierHistory>(safeGetItem(histKey), {});
  const lastTier = (safeGetItem(lastKey) ?? 'locked') as BadgeTier;

  if (TIER_ORDER[currentTier] > TIER_ORDER[lastTier] || currentTier !== 'locked') {
    const now = new Date().toISOString();
    // Record unlock date for every earned tier up to current
    for (const t of EARNED_TIERS) {
      if (TIER_ORDER[t] <= TIER_ORDER[currentTier] && !history[t]) {
        history[t] = now;
      }
    }
    try {
      localStorage.setItem(histKey,  JSON.stringify(history));
      localStorage.setItem(lastKey,  currentTier);
    } catch { /* ignore */ }
  }

  return history;
}

// ─── Compute badges ────────────────────────────────────────────────────────────

export function computeAllBadges(stats: UserStats): ComputedBadge[] {
  return BADGE_DEFS.map(def => {
    if (def.category === 'special') {
      return {
        id: def.id,
        name: def.name,
        description: def.description,
        unit: def.unit,
        verb: def.verb,
        tier: 'gold' as BadgeTier,
        current: 0,
        nextThreshold: null,
        progressPct: 100,
        isSpecial: true,
        memberSince: stats.signupDate
          ? new Date(stats.signupDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
          : undefined,
        isSeasonal: false,
      };
    }

    const count = def.statKey ? (stats[def.statKey] as number) : 0;
    const { tier, progressPct, nextThreshold } = computeTier(count, def.tiers!);

    if (def.category === 'seasonal' && def.seasonal) {
      const s = def.seasonal;
      const win = currentSeasonWindow(s);
      const isSeasonActive = win !== null;
      const effectiveTier  = isSeasonActive ? tier : 'locked';

      const earnedYears: number[] = safeParseJSON<number[]>(safeGetItem(`badge-earned-years-${def.id}`), []);
      if (tier === 'gold' && win && !earnedYears.includes(win.year)) {
        earnedYears.push(win.year);
        try { localStorage.setItem(`badge-earned-years-${def.id}`, JSON.stringify(earnedYears)); } catch { /* ignore */ }
      }

      const windowYear = win?.year ?? new Date().getFullYear();
      const seasonWindowText = formatSeasonWindow(s, isSeasonActive ? windowYear : windowYear + 1);

      return {
        id: def.id,
        name: def.name,
        description: def.description,
        unit: def.unit,
        verb: def.verb,
        tier: effectiveTier,
        current: count,
        nextThreshold,
        progressPct,
        thresholds: def.tiers,
        isSpecial: false,
        isSeasonal: true,
        seasonLabel: s.label,
        seasonEndDate: win ? win.end : nextSeasonStart(s),
        seasonWindowText,
        isSeasonActive,
        seasonEarnedYears: earnedYears,
      };
    }

    // All-time badge — track tier history
    const tierHistory = updateTierHistory(def.id, tier);

    return {
      id: def.id,
      name: def.name,
      description: def.description,
      unit: def.unit,
      verb: def.verb,
      tier,
      current: count,
      nextThreshold,
      progressPct,
      thresholds: def.tiers,
      tierHistory,
      isSpecial: false,
      isSeasonal: false,
    };
  });
}

