
// Badge system — definitions, tier computation, localStorage helpers

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

export interface WatchEntry {
  id: string;
  type: 'movie' | 'episode';
  loggedAt: string; // ISO timestamp
  hour: number;     // 0-23 local hour
  genre: string;    // e.g. "Horror, Thriller"
  language: string; // original_language code
}

interface TierThresholds {
  grey: number;
  bronze: number;
  silver: number;
  gold: number;
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
  tier: BadgeTier;
  current: number;
  nextThreshold: number | null;
  progressPct: number;
  isSpecial: boolean;
  memberSince?: string;
  isSeasonal: boolean;
  seasonLabel?: string;
  seasonEndDate?: Date;
  isSeasonActive?: boolean;
  seasonEarnedYears?: number[];
}

export interface ComingSoonBadge {
  id: string;
  name: string;
  description: string;
  activatesAt: Date;
  activatesLabel: string;
}

// ─── Badge definitions ─────────────────────────────────────────────────────────

const BADGE_DEFS: BadgeDefinition[] = [
  {
    id: 'founder',
    name: 'Founder',
    description: 'Awarded to everyone who joins the community.',
    category: 'special',
  },
  {
    id: 'movie-watcher',
    name: 'Movie Watcher',
    description: 'Log the movies you watch to climb the ranks.',
    category: 'alltime',
    statKey: 'moviesWatched',
    tiers: { grey: 1, bronze: 100, silver: 500, gold: 1000 },
  },
  {
    id: 'movie-rater',
    name: 'Movie Rater',
    description: 'Rate the movies you watch to show your taste.',
    category: 'alltime',
    statKey: 'moviesRated',
    tiers: { grey: 1, bronze: 100, silver: 500, gold: 1000 },
  },
  {
    id: 'show-watcher',
    name: 'Show Watcher',
    description: 'Log the show episodes you watch to climb the ranks.',
    category: 'alltime',
    statKey: 'episodesWatched',
    tiers: { grey: 1, bronze: 100, silver: 500, gold: 1000 },
  },
  {
    id: 'show-rater',
    name: 'Show Rater',
    description: 'Rate the show episodes you watch to show your taste.',
    category: 'alltime',
    statKey: 'episodesRated',
    tiers: { grey: 1, bronze: 100, silver: 500, gold: 1000 },
  },
  {
    id: 'reviewer',
    name: 'Reviewer',
    description: 'Write reviews to share your thoughts with the community.',
    category: 'alltime',
    statKey: 'reviewsWritten',
    tiers: { grey: 1, bronze: 10, silver: 100, gold: 250 },
  },
  {
    id: 'daily-marathon',
    name: 'Daily Marathon',
    description: 'Log multiple movies in a single day to earn this badge.',
    category: 'alltime',
    statKey: 'maxMoviesInDay',
    tiers: { grey: 1, bronze: 3, silver: 5, gold: 7 },
  },
  {
    id: 'weekly-watcher',
    name: 'Weekly Watcher',
    description: 'Log movies consistently every week to earn this badge.',
    category: 'alltime',
    statKey: 'maxMoviesInWeek',
    tiers: { grey: 1, bronze: 5, silver: 10, gold: 15 },
  },
  {
    id: 'night-owl',
    name: 'Night Owl',
    description: 'Log movies in the late hours of the night to earn this badge.',
    category: 'alltime',
    statKey: 'lateNightMovies',
    tiers: { grey: 1, bronze: 10, silver: 25, gold: 50 },
  },
  {
    id: 'social',
    name: 'Social',
    description: 'Follow other members of the community to earn this badge.',
    category: 'alltime',
    statKey: 'friendsFollowing',
    tiers: { grey: 1, bronze: 10, silver: 50, gold: 100 },
  },
  {
    id: 'world-cinema',
    name: 'World Cinema',
    description: 'Watch films from different countries around the world.',
    category: 'alltime',
    statKey: 'distinctLanguages',
    tiers: { grey: 5, bronze: 10, silver: 20, gold: 50 },
  },
  {
    id: 'halloween',
    name: 'Halloween Season',
    description: 'Watch horror films throughout October. Returns every year.',
    category: 'seasonal',
    statKey: 'halloweenCount',
    tiers: { grey: 3, bronze: 8, silver: 15, gold: 20 },
    seasonal: {
      startMonth: 10, startDay: 1,
      endMonth: 11, endDay: 1,
      genreKeyword: 'Horror',
      label: 'Halloween Season',
    },
  },
  {
    id: 'holiday',
    name: 'Holiday Season',
    description: 'Watch holiday films throughout December. Returns every year.',
    category: 'seasonal',
    statKey: 'holidayCount',
    tiers: { grey: 3, bronze: 8, silver: 15, gold: 20 },
    seasonal: {
      startMonth: 12, startDay: 1,
      endMonth: 12, endDay: 26,
      genreKeyword: 'Family',
      label: 'Holiday Season',
    },
  },
  {
    id: 'valentines',
    name: "Valentine's Week",
    description: "Watch romance films during Valentine's week. Returns every year.",
    category: 'seasonal',
    statKey: 'valentinesCount',
    tiers: { grey: 2, bronze: 5, silver: 8, gold: 10 },
    seasonal: {
      startMonth: 2, startDay: 7,
      endMonth: 2, endDay: 15,
      genreKeyword: 'Romance',
      label: "Valentine's Week",
    },
  },
  {
    id: 'new-year',
    name: 'New Year Season',
    description: 'Watch films during the first week of the new year. Returns every year.',
    category: 'seasonal',
    statKey: 'newYearCount',
    tiers: { grey: 1, bronze: 3, silver: 5, gold: 7 },
    seasonal: {
      startMonth: 12, startDay: 31,
      endMonth: 1, endDay: 8,
      crossesNewYear: true,
      label: 'New Year Season',
    },
  },
  {
    id: 'summer',
    name: 'Summer Blockbuster',
    description: 'Watch films throughout the summer to earn this badge. Returns every year.',
    category: 'seasonal',
    statKey: 'summerCount',
    tiers: { grey: 20, bronze: 50, silver: 75, gold: 100 },
    seasonal: {
      startMonth: 6, startDay: 1,
      endMonth: 9, endDay: 1,
      label: 'Summer Blockbuster',
    },
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
      if (key?.startsWith('watched-') && !key.startsWith('watched-episode-') && localStorage.getItem(key) === 'true') {
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
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('episode-rating-')) episodesRated++;
    }
  } catch { /* ignore */ }

  const watchLog      = safeParseJSON<WatchEntry[]>(safeGetItem('watch-log'), []);
  const movieEntries  = watchLog.filter(e => e.type === 'movie');
  const episodeEntries = watchLog.filter(e => e.type === 'episode');

  const episodesWatched  = episodeEntries.length;
  const reviewsWritten   = parseInt(safeGetItem('review-count')    ?? '0', 10) || 0;
  const friendsFollowing = parseInt(safeGetItem('following-count') ?? '0', 10) || 0;
  const signupDate       = safeGetItem('signup-date');

  const dayMap = new Map<string, number>();
  for (const e of movieEntries) {
    const day = e.loggedAt.slice(0, 10);
    dayMap.set(day, (dayMap.get(day) ?? 0) + 1);
  }
  const maxMoviesInDay = dayMap.size > 0 ? Math.max(...dayMap.values()) : 0;

  const weekMap = new Map<string, number>();
  for (const e of movieEntries) {
    const d = new Date(e.loggedAt);
    const mon = new Date(d);
    mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    weekMap.set(mon.toISOString().slice(0, 10), (weekMap.get(mon.toISOString().slice(0, 10)) ?? 0) + 1);
  }
  const maxMoviesInWeek = weekMap.size > 0 ? Math.max(...weekMap.values()) : 0;

  const lateNightMovies  = movieEntries.filter(e => e.hour >= 0 && e.hour < 4).length;
  const distinctLanguages = new Set(movieEntries.map(e => e.language).filter(Boolean)).size;

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
}

export function ensureSignupDate(): void {
  try {
    if (!localStorage.getItem('signup-date')) {
      localStorage.setItem('signup-date', new Date().toISOString());
    }
  } catch { /* ignore */ }
}

// ─── Compute badges ────────────────────────────────────────────────────────────

export function computeAllBadges(stats: UserStats): ComputedBadge[] {
  return BADGE_DEFS.map(def => {
    if (def.category === 'special') {
      return {
        id: def.id,
        name: def.name,
        description: def.description,
        tier: 'gold' as BadgeTier,
        current: 0,
        nextThreshold: null,
        progressPct: 100,
        isSpecial: true,
        memberSince: stats.signupDate
          ? new Date(stats.signupDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
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

      const earnedYears: number[] = safeParseJSON<number[]>(safeGetItem(`badge-earned-years-${def.id}`), []);
      if (tier === 'gold' && win && !earnedYears.includes(win.year)) {
        earnedYears.push(win.year);
        try { localStorage.setItem(`badge-earned-years-${def.id}`, JSON.stringify(earnedYears)); } catch { /* ignore */ }
      }

      return {
        id: def.id,
        name: def.name,
        description: def.description,
        tier: isSeasonActive ? tier : 'locked',
        current: count,
        nextThreshold,
        progressPct,
        isSpecial: false,
        isSeasonal: true,
        seasonLabel: s.label,
        seasonEndDate: win ? win.end : nextSeasonStart(s),
        isSeasonActive,
        seasonEarnedYears: earnedYears,
      };
    }

    return {
      id: def.id,
      name: def.name,
      description: def.description,
      tier,
      current: count,
      nextThreshold,
      progressPct,
      isSpecial: false,
      isSeasonal: false,
    };
  });
}

// Returns inactive seasonal badges for the "Coming Soon" section
export function getComingSoonBadges(): ComingSoonBadge[] {
  return BADGE_DEFS
    .filter(d => d.category === 'seasonal' && d.seasonal && !currentSeasonWindow(d.seasonal))
    .map(d => {
      const next = nextSeasonStart(d.seasonal!);
      return {
        id: d.id,
        name: d.name,
        description: d.description,
        activatesAt: next,
        activatesLabel: next.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      };
    });
}
