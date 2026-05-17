
// Badge system — all definitions and localStorage-based stat computation

export type BadgeTier = 'locked' | 'grey' | 'bronze' | 'silver' | 'gold';

export const TIER_COLORS: Record<BadgeTier, string> = {
  locked: '#374151',
  grey: '#9ca3af',
  bronze: '#cd7f32',
  silver: '#c0c0c0',
  gold: '#ffd700',
};

export const TIER_LABELS: Record<BadgeTier, string> = {
  locked: 'Locked',
  grey: 'Grey',
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
};

export interface WatchEntry {
  id: string;
  type: 'movie' | 'episode';
  loggedAt: string; // ISO timestamp
  hour: number;     // 0-23 local hour when logged
  genre: string;    // e.g. "Horror, Thriller"
  language: string; // original_language code e.g. "en", "fr", "ko"
}

interface TierThresholds {
  grey: number;
  bronze: number;
  silver: number;
  gold: number;
}

interface SeasonalWindow {
  startMonth: number; // 1-12
  startDay: number;
  endMonth: number;
  endDay: number;
  crossesNewYear?: boolean; // for Dec 31 – Jan 7
  genreKeyword?: string;    // filter genre string contains this word
  label: string;
}

interface BadgeDefinition {
  id: string;
  name: string;
  emoji: string;
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
  emoji: string;
  tier: BadgeTier;
  current: number;
  nextThreshold: number | null; // null at gold
  progressPct: number;          // 0-100 within current tier range
  isSpecial: boolean;
  memberSince?: string;
  isSeasonal: boolean;
  seasonLabel?: string;
  seasonEndDate?: Date;
  isSeasonActive?: boolean;
  seasonEarnedYears?: number[]; // years badge was fully earned (gold)
}

// ─── Badge definitions ────────────────────────────────────────────────────────

const BADGE_DEFS: BadgeDefinition[] = [
  // Special
  {
    id: 'founder',
    name: 'Founder',
    emoji: '🌟',
    category: 'special',
  },
  // All-time
  {
    id: 'movie-watcher',
    name: 'Movie Watcher',
    emoji: '🎬',
    category: 'alltime',
    statKey: 'moviesWatched',
    tiers: { grey: 1, bronze: 100, silver: 500, gold: 1000 },
  },
  {
    id: 'movie-rater',
    name: 'Movie Rater',
    emoji: '⭐',
    category: 'alltime',
    statKey: 'moviesRated',
    tiers: { grey: 1, bronze: 100, silver: 500, gold: 1000 },
  },
  {
    id: 'show-watcher',
    name: 'Show Watcher',
    emoji: '📺',
    category: 'alltime',
    statKey: 'episodesWatched',
    tiers: { grey: 1, bronze: 100, silver: 500, gold: 1000 },
  },
  {
    id: 'show-rater',
    name: 'Show Rater',
    emoji: '📺',
    category: 'alltime',
    statKey: 'episodesRated',
    tiers: { grey: 1, bronze: 100, silver: 500, gold: 1000 },
  },
  {
    id: 'reviewer',
    name: 'Reviewer',
    emoji: '✍️',
    category: 'alltime',
    statKey: 'reviewsWritten',
    tiers: { grey: 1, bronze: 10, silver: 100, gold: 250 },
  },
  {
    id: 'daily-marathon',
    name: 'Daily Marathon',
    emoji: '⚡',
    category: 'alltime',
    statKey: 'maxMoviesInDay',
    tiers: { grey: 1, bronze: 3, silver: 5, gold: 7 },
  },
  {
    id: 'weekly-watcher',
    name: 'Weekly Watcher',
    emoji: '📅',
    category: 'alltime',
    statKey: 'maxMoviesInWeek',
    tiers: { grey: 1, bronze: 5, silver: 10, gold: 15 },
  },
  {
    id: 'night-owl',
    name: 'Night Owl',
    emoji: '🌙',
    category: 'alltime',
    statKey: 'lateNightMovies',
    tiers: { grey: 1, bronze: 10, silver: 25, gold: 50 },
  },
  {
    id: 'social',
    name: 'Social',
    emoji: '👥',
    category: 'alltime',
    statKey: 'friendsFollowing',
    tiers: { grey: 1, bronze: 10, silver: 50, gold: 100 },
  },
  {
    id: 'world-cinema',
    name: 'World Cinema',
    emoji: '🌍',
    category: 'alltime',
    statKey: 'distinctLanguages',
    tiers: { grey: 5, bronze: 10, silver: 20, gold: 50 },
  },
  // Seasonal
  {
    id: 'halloween',
    name: 'Halloween Season',
    emoji: '🎃',
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
    emoji: '🎄',
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
    emoji: '❤️',
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
    emoji: '🎆',
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
    emoji: '☀️',
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

// ─── Tier computation helpers ─────────────────────────────────────────────────

function computeTier(
  count: number,
  t: TierThresholds,
): { tier: BadgeTier; progressPct: number; nextThreshold: number | null } {
  if (count >= t.gold) {
    return { tier: 'gold', progressPct: 100, nextThreshold: null };
  }
  if (count >= t.silver) {
    const pct = ((count - t.silver) / (t.gold - t.silver)) * 100;
    return { tier: 'silver', progressPct: Math.min(pct, 100), nextThreshold: t.gold };
  }
  if (count >= t.bronze) {
    const pct = ((count - t.bronze) / (t.silver - t.bronze)) * 100;
    return { tier: 'bronze', progressPct: Math.min(pct, 100), nextThreshold: t.silver };
  }
  if (count >= t.grey) {
    const pct = ((count - t.grey) / (t.bronze - t.grey)) * 100;
    return { tier: 'grey', progressPct: Math.min(pct, 100), nextThreshold: t.bronze };
  }
  // locked — show 0 / grey threshold
  return { tier: 'locked', progressPct: 0, nextThreshold: t.grey };
}

// ─── Seasonal window helpers ──────────────────────────────────────────────────

function seasonDates(s: SeasonalWindow, year: number): { start: Date; end: Date } {
  if (s.crossesNewYear) {
    // Dec 31 of `year-1` … Jan 7 of `year`
    return {
      start: new Date(year - 1, s.startMonth - 1, s.startDay, 0, 0, 0),
      end: new Date(year, s.endMonth - 1, s.endDay, 0, 0, 0),
    };
  }
  return {
    start: new Date(year, s.startMonth - 1, s.startDay, 0, 0, 0),
    end: new Date(year, s.endMonth - 1, s.endDay, 0, 0, 0),
  };
}

function currentSeasonWindow(s: SeasonalWindow): { start: Date; end: Date; year: number } | null {
  const now = new Date();
  const y = now.getFullYear();
  // Check current year and next year window
  for (const yr of [y, y + 1, y - 1]) {
    const { start, end } = seasonDates(s, yr);
    if (now >= start && now < end) {
      return { start, end, year: yr };
    }
  }
  return null;
}

// Returns the next upcoming season window start date
function nextSeasonStart(s: SeasonalWindow): Date {
  const now = new Date();
  const y = now.getFullYear();
  for (const yr of [y, y + 1]) {
    const { start } = seasonDates(s, yr);
    if (start > now) return start;
  }
  return seasonDates(s, y + 1).start;
}

// ─── localStorage readers ─────────────────────────────────────────────────────

function safeGetItem(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function safeParseJSON<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

export function readUserStats(): UserStats {
  // Total movies watched: count watched-* = "true"
  let moviesWatched = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('watched-') && !key.startsWith('watched-episode-') && localStorage.getItem(key) === 'true') {
        moviesWatched++;
      }
    }
  } catch { /* ignore */ }

  // Movies rated
  let moviesRated = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('movie-rating-')) moviesRated++;
    }
  } catch { /* ignore */ }

  // Episodes rated
  let episodesRated = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('episode-rating-')) episodesRated++;
    }
  } catch { /* ignore */ }

  // Watch log for time-based and detailed stats
  const watchLog = safeParseJSON<WatchEntry[]>(safeGetItem('watch-log'), []);
  const movieEntries = watchLog.filter(e => e.type === 'movie');
  const episodeEntries = watchLog.filter(e => e.type === 'episode');

  const episodesWatched = episodeEntries.length;
  const reviewsWritten = parseInt(safeGetItem('review-count') ?? '0', 10) || 0;
  const friendsFollowing = parseInt(safeGetItem('following-count') ?? '0', 10) || 0;
  const signupDate = safeGetItem('signup-date');

  // Max movies in a single calendar day
  const dayMap = new Map<string, number>();
  for (const e of movieEntries) {
    const day = e.loggedAt.slice(0, 10); // "YYYY-MM-DD"
    dayMap.set(day, (dayMap.get(day) ?? 0) + 1);
  }
  const maxMoviesInDay = dayMap.size > 0 ? Math.max(...dayMap.values()) : 0;

  // Max movies in a single Mon–Sun week
  const weekMap = new Map<string, number>();
  for (const e of movieEntries) {
    const d = new Date(e.loggedAt);
    const day = d.getDay(); // 0=Sun
    const mon = new Date(d);
    mon.setDate(d.getDate() - ((day + 6) % 7)); // Monday
    const weekKey = mon.toISOString().slice(0, 10);
    weekMap.set(weekKey, (weekMap.get(weekKey) ?? 0) + 1);
  }
  const maxMoviesInWeek = weekMap.size > 0 ? Math.max(...weekMap.values()) : 0;

  // Late night logs: hour 0-3
  const lateNightMovies = movieEntries.filter(e => e.hour >= 0 && e.hour < 4).length;

  // Distinct languages (proxy for World Cinema)
  const languages = new Set(movieEntries.map(e => e.language).filter(Boolean));
  const distinctLanguages = languages.size;

  // Seasonal counts — computed from watch-log entries within each window (current year)
  const now = new Date();
  const y = now.getFullYear();

  function countInWindow(s: SeasonalWindow, genreKeyword?: string): number {
    const win = currentSeasonWindow(s);
    if (!win) {
      // Season not currently active; still count progress from this year
      const { start, end } = seasonDates(s, y);
      return movieEntries.filter(e => {
        const t = new Date(e.loggedAt);
        return t >= start && t < end && (!genreKeyword || e.genre?.includes(genreKeyword));
      }).length;
    }
    return movieEntries.filter(e => {
      const t = new Date(e.loggedAt);
      return t >= win.start && t < win.end && (!genreKeyword || e.genre?.includes(genreKeyword));
    }).length;
  }

  const halloweenCount = countInWindow(
    { startMonth: 10, startDay: 1, endMonth: 11, endDay: 1, genreKeyword: 'Horror', label: '' },
    'Horror',
  );
  const holidayCount = countInWindow(
    { startMonth: 12, startDay: 1, endMonth: 12, endDay: 26, genreKeyword: 'Family', label: '' },
    'Family',
  );
  const valentinesCount = countInWindow(
    { startMonth: 2, startDay: 7, endMonth: 2, endDay: 15, genreKeyword: 'Romance', label: '' },
    'Romance',
  );
  const newYearCount = countInWindow(
    { startMonth: 12, startDay: 31, endMonth: 1, endDay: 8, crossesNewYear: true, label: '' },
  );
  const summerCount = countInWindow(
    { startMonth: 6, startDay: 1, endMonth: 9, endDay: 1, label: '' },
  );

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
    halloweenCount,
    holidayCount,
    valentinesCount,
    newYearCount,
    summerCount,
  };
}

// ─── Write helpers ─────────────────────────────────────────────────────────────

export function appendWatchLog(entry: { id: string; type: 'movie' | 'episode'; genre: string; language: string; loggedAt?: string }): void {
  try {
    const now = new Date();
    const log = safeParseJSON<WatchEntry[]>(safeGetItem('watch-log'), []);
    const newEntry: WatchEntry = {
      ...entry,
      loggedAt: entry.loggedAt ?? now.toISOString(),
      hour: now.getHours(),
    };
    // Deduplicate: remove existing entry with same id+type and add new one
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

// ─── Compute all badges ───────────────────────────────────────────────────────

export function computeAllBadges(stats: UserStats): ComputedBadge[] {
  return BADGE_DEFS.map(def => {
    // Founder badge: always gold, always shown
    if (def.category === 'special') {
      const memberSince = stats.signupDate
        ? new Date(stats.signupDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
        : undefined;
      return {
        id: def.id,
        name: def.name,
        emoji: def.emoji,
        tier: 'gold' as BadgeTier,
        current: 0,
        nextThreshold: null,
        progressPct: 100,
        isSpecial: true,
        memberSince,
        isSeasonal: false,
      };
    }

    const count = def.statKey ? (stats[def.statKey] as number) : 0;
    const { tier, progressPct, nextThreshold } = computeTier(count, def.tiers!);

    if (def.category === 'seasonal' && def.seasonal) {
      const s = def.seasonal;
      const win = currentSeasonWindow(s);
      const isSeasonActive = win !== null;

      // Determine earned years (years where they hit gold)
      const earnedYears: number[] = safeParseJSON<number[]>(
        safeGetItem(`badge-earned-years-${def.id}`),
        [],
      );

      // Persist gold earned for current year
      if (tier === 'gold' && win) {
        const yr = win.year;
        if (!earnedYears.includes(yr)) {
          earnedYears.push(yr);
          try { localStorage.setItem(`badge-earned-years-${def.id}`, JSON.stringify(earnedYears)); } catch { /* ignore */ }
        }
      }

      return {
        id: def.id,
        name: def.name,
        emoji: def.emoji,
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
      emoji: def.emoji,
      tier,
      current: count,
      nextThreshold,
      progressPct,
      isSpecial: false,
      isSeasonal: false,
    };
  });
}
