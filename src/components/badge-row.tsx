"use client"

import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { BadgeMedal } from '@/components/badge-medal';
import { BadgeDetail } from '@/components/badge-detail';
import { BADGE_BY_ID, progressTo, type BadgeTierName, type EarnedBadge } from '@/lib/badge-defs';

export type { EarnedBadge };

const TIER_LABEL: Record<BadgeTierName, string> = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold' };

/** Which tier the next threshold would earn. */
function nextTierName(badge: EarnedBadge): BadgeTierName | null {
  const def = BADGE_BY_ID.get(badge.id);
  if (!def?.tiers || badge.next === null) return null;
  if (badge.next === def.tiers.bronze) return 'bronze';
  if (badge.next === def.tiers.silver) return 'silver';
  return 'gold';
}

function progressOf(badge: EarnedBadge): number {
  const def = BADGE_BY_ID.get(badge.id);
  return def?.tiers ? progressTo(badge.count, def.tiers) : 1;
}

// A full-width row, not a small square card — a badge should read like a line in
// a list, with room for the medal to be a medal. Pressing it opens the detail,
// so the row stays one line and everything else lives behind the tap.
export function BadgeRow({ badge, onOpen }: { badge: EarnedBadge; onOpen: (b: EarnedBadge) => void }) {
  const def = BADGE_BY_ID.get(badge.id);
  if (!def) return null;

  const earned = badge.tier !== null;
  const next = nextTierName(badge);

  const detail = !def.tiers
    ? def.description
    : earned
      ? `${badge.count.toLocaleString()} ${def.unit}${badge.next ? ` · ${badge.next.toLocaleString()} for ${TIER_LABEL[next!].toLowerCase()}` : ''}`
      : `${badge.count.toLocaleString()} of ${badge.next?.toLocaleString()} ${def.unit}`;

  return (
    <button
      type="button"
      onClick={() => onOpen(badge)}
      className="w-full flex items-center gap-3 py-2 border-b border-border last:border-0 text-left hover:opacity-70 transition-opacity"
    >
      <BadgeMedal tier={badge.tier} progress={progressOf(badge)} size={56} />
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold font-headline leading-snug ${earned ? 'text-foreground' : 'text-muted-foreground'}`}>
          {def.name}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">{detail}</p>
      </div>
      <span className="text-[11px] font-semibold text-muted-foreground shrink-0">
        {earned ? TIER_LABEL[badge.tier!] : 'Locked'}
      </span>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </button>
  );
}

export function BadgeList({ badges, memberSince, limit, username }: {
  badges: EarnedBadge[];
  memberSince?: string;
  /** Show only the first N after sorting — the profile shows a taste, /badges shows all. */
  limit?: number;
  /** Whose badges these are — World cinema's detail lists their languages. */
  username?: string;
}) {
  const [open, setOpen] = useState<EarnedBadge | null>(null);

  // Founder always leads: it's the one everybody has and the one that says when
  // you arrived. After that, earned first and strongest at the top, then
  // whatever's closest to being won.
  const rank: Record<string, number> = { gold: 3, silver: 2, bronze: 1 };
  const sorted = [...badges].sort((a, b) => {
    if (a.id === 'founder') return -1;
    if (b.id === 'founder') return 1;
    const ta = a.tier ? rank[a.tier] : 0;
    const tb = b.tier ? rank[b.tier] : 0;
    if (ta !== tb) return tb - ta;
    return progressOf(b) - progressOf(a);
  });

  const shown = limit ? sorted.slice(0, limit) : sorted;

  return (
    <>
      <div>{shown.map(b => <BadgeRow key={b.id} badge={b} onOpen={setOpen} />)}</div>
      <BadgeDetail badge={open} open={open !== null} onClose={() => setOpen(null)} memberSince={memberSince} username={username} />
    </>
  );
}

// The "Founding Member · since …" line at the top of a profile. Pressing it opens
// the same sheet as the badge row, so the chip and the badge are one thing said
// twice rather than two different-looking answers.
export function FounderChip({ memberSince }: { memberSince?: string }) {
  const [open, setOpen] = useState(false);
  if (!memberSince) return null;

  const founder: EarnedBadge = { id: 'founder', count: 1, tier: 'gold', next: null };
  const date = new Date(memberSince).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm font-bold whitespace-nowrap transition-transform active:scale-95"
        style={{ color: '#8a6d00' }}
      >
        Founding Member · since {date}
      </button>
      <BadgeDetail badge={founder} open={open} onClose={() => setOpen(false)} memberSince={memberSince} />
    </>
  );
}
