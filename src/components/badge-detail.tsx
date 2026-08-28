"use client"

import React, { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BadgeMedal } from '@/components/badge-medal';
import { BADGE_BY_ID, progressTo, type BadgeTierName } from '@/lib/badge-defs';
import type { EarnedBadge } from '@/lib/badge-defs';

const TIER_LABEL: Record<BadgeTierName, string> = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold' };
const TIER_ORDER: BadgeTierName[] = ['bronze', 'silver', 'gold'];

const CHIP: Record<BadgeTierName, string> = {
  bronze: 'bg-[#C87F45]/15 text-[#7A4718] dark:text-[#E0A570]',
  silver: 'bg-[#A8AAB2]/20 text-[#5A5C64] dark:text-[#D5D7DD]',
  gold:   'bg-[#D9A72C]/18 text-[#8A6510] dark:text-[#F3D072]',
};

interface WatchedLanguage { code: string; count: number; }

// Language codes into names, using the browser's own table rather than a list we
// would have to maintain. Falls back to the code itself — an unknown code shown
// as "cn" is still more use than an empty row.
function languageName(code: string): string {
  try {
    return new Intl.DisplayNames(undefined, { type: 'language' }).of(code) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

// The languages behind World cinema, loaded only when that badge is opened.
//
// It lists what you HAVE watched and stops there. Suggesting what to watch next
// would mean picking the languages worth having, and that is the user's call —
// seeing that ten of your 566 films are French and one is Turkish is enough to
// decide where to go next without being told.
function WatchedLanguages({ username }: { username?: string }) {
  const [languages, setLanguages] = useState<WatchedLanguage[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!username) return;
    let cancelled = false;
    fetchWithAuth(`/api/users/${username}/languages`)
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (cancelled) return;
        const list = json?.data?.languages;
        if (Array.isArray(list)) setLanguages(list); else setFailed(true);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [username]);

  if (!username || failed) return null;

  return (
    <div className="space-y-1">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Languages watched</p>
      {languages === null ? (
        <p className="text-sm text-muted-foreground px-3 py-2">Loading…</p>
      ) : languages.length === 0 ? (
        <p className="text-sm text-muted-foreground px-3 py-2">No films logged yet.</p>
      ) : (
        // No inner cap: the dialog itself scrolls, and a scrolling list inside a
        // scrolling dialog is a trap on a phone. Nothing is trimmed either —
        // the rare languages at the bottom are the whole point of looking.
        <div>
          {languages.map(l => (
            <div key={l.code} className="flex items-baseline gap-3 rounded-xl px-3 py-2">
              <span className="flex-1 text-sm font-semibold text-foreground truncate">{languageName(l.code)}</span>
              <span className="text-sm text-muted-foreground shrink-0">
                {l.count.toLocaleString()} {l.count === 1 ? 'film' : 'films'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// What one badge is, how far along you are, and what's left. Opened by pressing
// a badge row — the row itself stays a single line, and everything that would
// have crowded it lives here instead.
export function BadgeDetail({ badge, open, onClose, memberSince, username }: {
  badge: EarnedBadge | null;
  open: boolean;
  onClose: () => void;
  /** ISO date, shown on Founder — the one badge whose story is a date. */
  memberSince?: string;
  /** Whose badges these are. Only World cinema needs it, to list the languages. */
  username?: string;
}) {
  const def = badge ? BADGE_BY_ID.get(badge.id) : undefined;
  if (!badge || !def) return null;

  const earned = badge.tier !== null;
  const progress = def.tiers ? progressTo(badge.count, def.tiers) : 1;
  const remaining = badge.next !== null ? badge.next - badge.count : 0;
  const nextTier = def.tiers && badge.next !== null
    ? (badge.next === def.tiers.bronze ? 'bronze' : badge.next === def.tiers.silver ? 'silver' : 'gold') as BadgeTierName
    : null;

  // The bar runs between the tier you're on and the one you're chasing, not from
  // zero — otherwise every step past bronze looks nearly finished.
  const floor = def.tiers && badge.next !== null
    ? (badge.next === def.tiers.bronze ? 0 : badge.next === def.tiers.silver ? def.tiers.bronze : def.tiers.silver)
    : 0;

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm rounded-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <BadgeMedal tier={badge.tier} progress={progress} size={48} />
            <div className="min-w-0">
              <DialogTitle className="text-lg font-headline font-bold leading-tight">{def.name}</DialogTitle>
              <span
                className={`inline-block mt-1 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${
                  earned ? CHIP[badge.tier!] : 'bg-muted text-muted-foreground'
                }`}
              >
                {earned ? TIER_LABEL[badge.tier!] : 'Locked'}
              </span>
            </div>
          </div>
        </DialogHeader>

        <p className="text-sm text-muted-foreground leading-relaxed">{def.description}</p>

        {/* Founder has no tiers to climb — the date it happened is the whole badge. */}
        {!def.tiers && memberSince && (
          <div className="bg-muted/50 rounded-2xl p-4">
            <p className="text-base font-bold font-headline">
              Member since {new Date(memberSince).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
        )}

        {def.tiers && (
          <>
            <div className="bg-muted/50 rounded-2xl p-4 space-y-3">
              <p className="text-lg font-bold font-headline">
                {badge.count.toLocaleString()} {def.unit}
              </p>
              {badge.next !== null ? (
                <p className="text-sm text-muted-foreground">
                  {remaining.toLocaleString()} more to reach {TIER_LABEL[nextTier!]}.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Every tier earned.</p>
              )}
              <div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
                </div>
                {badge.next !== null && (
                  <div className="flex justify-between mt-1.5 text-[11px] text-muted-foreground">
                    <span>{floor.toLocaleString()}</span>
                    <span className="font-semibold">{badge.next.toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>

            {badge.id === 'world-cinema' && <WatchedLanguages username={username} />}

            <div className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Tiers</p>
              {TIER_ORDER.map(t => {
                const threshold = def.tiers![t];
                const reached = badge.count >= threshold;
                const isCurrent = badge.tier === t;
                return (
                  <div
                    key={t}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${isCurrent ? 'bg-muted' : ''}`}
                  >
                    <span className="w-4 shrink-0 flex justify-center">
                      {reached
                        ? <Check className="h-4 w-4 text-primary" />
                        : <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />}
                    </span>
                    <span className={`text-sm font-semibold w-16 shrink-0 ${reached ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {TIER_LABEL[t]}
                    </span>
                    <span className="flex-1 text-sm text-muted-foreground">
                      {threshold.toLocaleString()} {def.unit}
                    </span>
                    {isCurrent && <span className="text-[11px] font-semibold text-muted-foreground shrink-0">Current</span>}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
