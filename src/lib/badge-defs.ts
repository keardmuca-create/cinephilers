// The badge set, shared by the server that computes it and the UI that draws it.
//
// Three tiers only — bronze, silver, gold. There is no grey: a badge you haven't
// earned isn't a badge, it's progress toward one, and the UI draws it as an
// outline with a progress ring instead of handing out a medal for showing up.
//
// Watching splits into films and shows because the effort differs enormously —
// finishing a 177-episode series is not the same act as watching a 90-minute
// film. Rating doesn't split for the tiers' sake, but films, shows and episodes
// are counted separately because they're separate opinions.

export type BadgeTierName = 'bronze' | 'silver' | 'gold';

export interface BadgeTiers {
  bronze: number;
  silver: number;
  gold: number;
}

export interface BadgeDef {
  id: string;
  name: string;
  description: string;
  /** Noun for the count, e.g. "films" in "561 films". */
  unit: string;
  /** Lucide icon name the medal draws in its centre. */
  icon: string;
  /** Absent for Founder, which isn't earned by activity. */
  tiers?: BadgeTiers;
}

export const BADGES: BadgeDef[] = [
  {
    id: 'movie-watcher',
    name: 'Movie watcher',
    description: 'Log the films you watch.',
    unit: 'films',
    icon: 'film',
    tiers: { bronze: 100, silver: 500, gold: 1000 },
  },
  {
    id: 'movie-rater',
    name: 'Movie rater',
    description: 'Rate the films you watch.',
    unit: 'rated',
    icon: 'star',
    tiers: { bronze: 100, silver: 500, gold: 1000 },
  },
  {
    // The id stays 'show-watcher' because stored snapshots are keyed by it, but
    // the NAME had to change: Watch History counts shows you've touched and this
    // counts shows you've finished, so two different numbers were both called
    // "shows". "Completionist" says which one this is without having to be told.
    id: 'show-watcher',
    // Completed only — a show you're partway through is progress, not a finish.
    // Mini-series count: finishing one is finishing a show.
    name: 'Completionist',
    description: 'Finish shows and mini-series from first episode to last.',
    unit: 'completed',
    icon: 'tv',
    tiers: { bronze: 10, silver: 50, gold: 100 },
  },
  {
    id: 'show-rater',
    name: 'Show rater',
    description: 'Rate the shows you watch.',
    unit: 'rated',
    icon: 'award',
    tiers: { bronze: 10, silver: 50, gold: 100 },
  },
  {
    id: 'episodes-watched',
    // Exists because Show watcher only counts finished shows. Someone who
    // watches one episode for a guest star still did something.
    name: 'Episodes watched',
    description: 'Every episode counts, finished show or not.',
    unit: 'episodes',
    icon: 'list-video',
    tiers: { bronze: 100, silver: 500, gold: 1000 },
  },
  {
    id: 'episode-rater',
    // Every episode is its own title in the Cinephilers score, so episode
    // ratings are the thinnest part of it by a wide margin.
    name: 'Episode rater',
    description: 'Rate episodes to build the community score.',
    unit: 'rated',
    icon: 'sparkles',
    tiers: { bronze: 100, silver: 500, gold: 1000 },
  },
  {
    id: 'reviewer',
    name: 'Reviewer',
    description: 'Write reviews to share what you thought.',
    unit: 'reviews',
    icon: 'pen-line',
    tiers: { bronze: 50, silver: 250, gold: 500 },
  },
  {
    id: 'world-cinema',
    name: 'World cinema',
    description: 'Watch films in languages from around the world.',
    unit: 'languages',
    icon: 'globe',
    tiers: { bronze: 10, silver: 20, gold: 50 },
  },
  {
    id: 'founder',
    name: 'Founder',
    description: 'Awarded to everyone who joins the community.',
    unit: '',
    icon: 'logo',
  },
];

export const BADGE_BY_ID = new Map(BADGES.map(b => [b.id, b]));

export interface EarnedBadge {
  id: string;
  count: number;
  tier: BadgeTierName | null;
  /** The count still to reach; null once gold is earned or for Founder. */
  next: number | null;
}

export interface BadgeSnapshot {
  badges: EarnedBadge[];
  computedAt: string;
}

/** Counts turned into earned tiers and what's left to climb. */
export function snapshotFrom(counts: Record<string, number>): BadgeSnapshot {
  return {
    computedAt: new Date().toISOString(),
    badges: BADGES.map(def => {
      const count = counts[def.id] ?? 0;
      if (!def.tiers) {
        // Founder: earned on sight, no tiers, nothing to climb.
        return { id: def.id, count, tier: 'gold' as const, next: null };
      }
      return {
        id: def.id,
        count,
        tier: tierFor(count, def.tiers),
        next: nextThreshold(count, def.tiers),
      };
    }),
  };
}

/** The tier a count has reached, or null when it hasn't reached bronze. */
export function tierFor(count: number, tiers: BadgeTiers): BadgeTierName | null {
  if (count >= tiers.gold) return 'gold';
  if (count >= tiers.silver) return 'silver';
  if (count >= tiers.bronze) return 'bronze';
  return null;
}

/** The threshold still to climb to, or null once gold is reached. */
export function nextThreshold(count: number, tiers: BadgeTiers): number | null {
  if (count < tiers.bronze) return tiers.bronze;
  if (count < tiers.silver) return tiers.silver;
  if (count < tiers.gold) return tiers.gold;
  return null;
}

/** How far along toward the next threshold, 0–1. Full once gold is reached. */
export function progressTo(count: number, tiers: BadgeTiers): number {
  const next = nextThreshold(count, tiers);
  if (next === null) return 1;
  const floor = next === tiers.bronze ? 0 : next === tiers.silver ? tiers.bronze : tiers.silver;
  return Math.max(0, Math.min(1, (count - floor) / (next - floor)));
}
