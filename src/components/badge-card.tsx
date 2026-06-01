
"use client"

import React, { useEffect, useState } from 'react';
import { X, Check, Lock } from 'lucide-react';
import {
  ComputedBadge, ComingSoonBadge,
  TIER_COLORS, TIER_LABELS, TIER_ORDER, EARNED_TIERS,
  BadgeTier, EarnedTier, TierThresholds, TierHistory,
} from '@/lib/badges';
import { Dialog, DialogContent } from '@/components/ui/dialog';

// ─── Medal SVG ─────────────────────────────────────────────────────────────────

export function MedalIcon({ color, size = 28 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9"    y="1.5" width="2.2" height="7" rx="1.1" fill={color} fillOpacity="0.75" />
      <rect x="12.8" y="1.5" width="2.2" height="7" rx="1.1" fill={color} fillOpacity="0.75" />
      <circle cx="12" cy="16" r="6.5" fill={color} fillOpacity="0.12" stroke={color} strokeWidth="1.5" />
      <circle cx="12" cy="16" r="3.5"  fill={color} fillOpacity="0.3" />
    </svg>
  );
}

// ─── Countdown hook ────────────────────────────────────────────────────────────

function useCountdown(target: Date | undefined): string {
  const [label, setLabel] = useState('');
  useEffect(() => {
    if (!target) return;
    const tick = () => {
      const diff = target.getTime() - Date.now();
      if (diff <= 0) { setLabel('Expired'); return; }
      const d = Math.floor(diff / 86_400_000);
      const h = Math.floor((diff % 86_400_000) / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      if (d > 0)      setLabel(`${d}d ${h}h ${m}m`);
      else if (h > 0) setLabel(`${h}h ${m}m`);
      else            setLabel(`${m}m`);
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [target]);
  return label;
}

// ─── Inline progress bar ───────────────────────────────────────────────────────

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: `${color}22` }}>
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }}
      />
    </div>
  );
}

// ─── Tier roadmap row ──────────────────────────────────────────────────────────

interface RoadmapRowProps {
  rowTier: EarnedTier;
  threshold: number;
  unit: string;
  current: number;
  activeTier: BadgeTier;
  history?: TierHistory;
}

function RoadmapRow({ rowTier, threshold, unit, current, activeTier, history }: RoadmapRowProps) {
  const rowOrder    = TIER_ORDER[rowTier];
  const activeOrder = TIER_ORDER[activeTier];
  const color       = TIER_COLORS[rowTier];
  const isCurrent   = rowTier === activeTier;
  const isEarned    = rowOrder < activeOrder;
  const isFuture    = rowOrder > activeOrder;
  const remaining   = threshold - current;

  const unlockDate = history?.[rowTier];
  const dateLabel  = unlockDate
    ? new Date(unlockDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : null;

  return (
    <div
      className={`flex items-center gap-2 rounded-xl px-3 py-2.5 transition-colors ${
        isCurrent ? 'bg-white/[0.07]' : isFuture ? 'opacity-40' : ''
      }`}
      style={{ borderLeft: isCurrent ? `2px solid ${color}` : '2px solid transparent' }}
    >
      {/* Status icon */}
      <div className="flex items-center justify-center h-5 w-5 shrink-0">
        {isEarned ? (
          <Check className="h-3.5 w-3.5" style={{ color }} />
        ) : isCurrent ? (
          <div className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        ) : (
          <div className="h-2 w-2 rounded-full bg-white/20" />
        )}
      </div>

      {/* Tier label */}
      <span className="text-xs font-bold w-14 shrink-0" style={{ color: isFuture ? undefined : color }}>
        {TIER_LABELS[rowTier]}
      </span>

      {/* Threshold — centered */}
      <span className="flex-1 text-center text-xs text-muted-foreground tabular-nums">
        {threshold.toLocaleString()} {unit}
      </span>

      {/* Right label */}
      <div className="text-right shrink-0 min-w-[2rem]">
        {isEarned && dateLabel ? (
          <span className="text-[10px] text-muted-foreground tabular-nums">{dateLabel}</span>
        ) : isCurrent ? (
          <span className="text-[10px] font-bold" style={{ color }}>Current</span>
        ) : remaining > 0 ? (
          <span className="text-[10px] text-muted-foreground tabular-nums">{remaining.toLocaleString()} more</span>
        ) : null}
      </div>
    </div>
  );
}

// ─── Badge detail modal ────────────────────────────────────────────────────────

interface BadgeDetailModalProps {
  badge: ComputedBadge;
  open: boolean;
  onClose: () => void;
}

function BadgeDetailModal({ badge, open, onClose }: BadgeDetailModalProps) {
  const color    = TIER_COLORS[badge.tier];
  const isGold   = badge.tier === 'gold';
  const isLocked = badge.tier === 'locked';
  const countdown = useCountdown(badge.isSeasonal && badge.isSeasonActive ? badge.seasonEndDate : undefined);

  // Next tier label
  const nextTierEntry = EARNED_TIERS.find(t => TIER_ORDER[t] > TIER_ORDER[badge.tier]);

  // Summary text
  const summaryText = badge.isSpecial
    ? badge.memberSince ? `Member since ${badge.memberSince}` : 'Founding member'
    : isGold
    ? `${badge.current.toLocaleString()} ${badge.unit} total`
    : `${badge.current.toLocaleString()} ${badge.unit}`;

  // Next tier instruction
  const nextInstruction = (() => {
    if (badge.isSpecial) return null;
    if (isGold) return 'You have reached the highest tier.';
    if (isLocked && badge.nextThreshold) {
      return `${badge.verb} ${badge.nextThreshold.toLocaleString()} ${badge.unit} to unlock this badge.`;
    }
    if (badge.nextThreshold && nextTierEntry) {
      const remaining = badge.nextThreshold - badge.current;
      return `${badge.verb} ${remaining.toLocaleString()} more ${badge.unit} to reach ${TIER_LABELS[nextTierEntry]}.`;
    }
    return null;
  })();

  const t = badge.thresholds;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm w-full rounded-3xl bg-[#111] border border-white/[0.08] p-0 gap-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between p-5 pb-4" style={{ borderBottom: `1px solid ${color}22` }}>
          <div className="flex items-center gap-3">
            <MedalIcon color={color} size={36} />
            <div>
              <p className="font-bold text-base leading-tight">{badge.name}</p>
              <span
                className="text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full mt-1 inline-block"
                style={{ color, backgroundColor: `${color}18`, border: `1px solid ${color}33` }}
              >
                {TIER_LABELS[badge.tier]}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-7 w-7 rounded-full flex items-center justify-center bg-white/[0.06] hover:bg-white/[0.12] transition-colors shrink-0"
          >
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5 overflow-y-auto max-h-[70vh]">

          {/* Description */}
          <p className="text-sm text-muted-foreground leading-relaxed">{badge.description}</p>

          {/* Summary block */}
          <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-4 space-y-3">
            <p className="text-base font-bold" style={{ color }}>{summaryText}</p>

            {nextInstruction && (
              <p className="text-sm text-muted-foreground">{nextInstruction}</p>
            )}

            {/* Progress bar */}
            {!badge.isSpecial && !isGold && (
              <div className="space-y-1.5 pt-1">
                <ProgressBar pct={badge.progressPct} color={color} />
                <div className="flex justify-between text-[10px] font-bold tabular-nums">
                  <span style={{ color: isLocked ? '#4b5563' : color }}>{badge.current.toLocaleString()}</span>
                  <span className="text-muted-foreground">{badge.nextThreshold?.toLocaleString() ?? '—'}</span>
                </div>
              </div>
            )}
          </div>

          {/* Seasonal info */}
          {badge.isSeasonal && (
            <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-4 space-y-2">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Seasonal</p>
              {badge.seasonWindowText && (
                <p className="text-sm">
                  <span className="text-muted-foreground">Active window: </span>
                  <span className="font-medium text-white/80">{badge.seasonWindowText}</span>
                </p>
              )}
              {badge.isSeasonActive && countdown && (
                <p className="text-sm font-bold" style={{ color }}>{countdown} remaining</p>
              )}
              {!badge.isSeasonActive && badge.seasonEndDate && (
                <p className="text-sm text-muted-foreground">
                  Next season starts{' '}
                  <span className="font-medium text-white/70">
                    {badge.seasonEndDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </span>
                </p>
              )}
              {(badge.seasonEarnedYears?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <span className="text-xs text-muted-foreground self-center">Earned:</span>
                  {badge.seasonEarnedYears!.map(yr => (
                    <span
                      key={yr}
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ color: TIER_COLORS.gold, backgroundColor: `${TIER_COLORS.gold}18`, border: `1px solid ${TIER_COLORS.gold}33` }}
                    >
                      {badge.name.split(' ')[0]} {yr}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tier roadmap — for all non-special badges */}
          {!badge.isSpecial && t && (
            <div className="space-y-1">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground px-1 pb-1">Tier Roadmap</p>
              <div className="space-y-0.5">
                {EARNED_TIERS.map(rowTier => (
                  <RoadmapRow
                    key={rowTier}
                    rowTier={rowTier}
                    threshold={t[rowTier as keyof TierThresholds]}
                    unit={badge.unit}
                    current={badge.current}
                    activeTier={badge.tier}
                    history={badge.tierHistory}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Gold: tier history summary */}
          {isGold && badge.tierHistory && (
            <div className="space-y-1">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground px-1 pb-1">Tier History</p>
              <div className="space-y-0.5">
                {EARNED_TIERS.map(t => {
                  const date = badge.tierHistory![t];
                  return (
                    <div key={t} className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/[0.03]">
                      <div className="flex items-center gap-2">
                        <Check className="h-3 w-3" style={{ color: TIER_COLORS[t] }} />
                        <span className="text-xs font-bold" style={{ color: TIER_COLORS[t] }}>{TIER_LABELS[t]}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {date
                          ? new Date(date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
                          : '—'
                        }
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Badge card (clickable) ────────────────────────────────────────────────────

interface BadgeCardProps {
  badge: ComputedBadge;
}

export function BadgeCard({ badge }: BadgeCardProps) {
  const [modalOpen, setModalOpen] = useState(false);

  const color    = TIER_COLORS[badge.tier];
  const isGold   = badge.tier === 'gold';
  const isLocked = badge.tier === 'locked';
  const countdown = useCountdown(badge.isSeasonal && badge.isSeasonActive ? badge.seasonEndDate : undefined);

  return (
    <>
      <button
        onClick={() => setModalOpen(true)}
        className="text-left flex flex-col gap-3 rounded-2xl p-4 bg-white/5 border border-white/[0.08] transition-colors duration-200 hover:bg-white/[0.08] active:scale-[0.98] w-full"
        style={{ borderColor: `${color}33` }}
      >
        {/* Icon row */}
        <div className="flex items-start justify-between gap-2">
          <div className="relative">
            <MedalIcon color={color} size={30} />
            {isLocked && (
              <div className="absolute -bottom-1 -right-1 bg-[#111] rounded-full p-0.5">
                <Lock className="h-2.5 w-2.5" style={{ color }} />
              </div>
            )}
          </div>
          <span
            className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full shrink-0"
            style={{ color, backgroundColor: `${color}18`, border: `1px solid ${color}33` }}
          >
            {TIER_LABELS[badge.tier]}
          </span>
        </div>

        {/* Name + description */}
        <div className="space-y-1">
          <p className={`text-sm font-bold leading-tight ${isLocked ? 'text-muted-foreground' : 'text-foreground'}`}>
            {badge.name}
          </p>
          <p className="text-[11px] leading-snug text-muted-foreground line-clamp-2">
            {badge.description}
          </p>
        </div>

        {/* Founder */}
        {badge.isSpecial && badge.memberSince && (
          <p className="text-[11px] font-medium" style={{ color }}>Member since {badge.memberSince}</p>
        )}

        {/* Seasonal countdown */}
        {badge.isSeasonal && badge.isSeasonActive && countdown && (
          <p className="text-[10px] font-bold" style={{ color }}>{countdown} remaining</p>
        )}

        {/* Earned years */}
        {badge.isSeasonal && (badge.seasonEarnedYears?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-1">
            {badge.seasonEarnedYears!.map(yr => (
              <span
                key={yr}
                className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ color: TIER_COLORS.gold, backgroundColor: `${TIER_COLORS.gold}18`, border: `1px solid ${TIER_COLORS.gold}33` }}
              >
                {badge.name.split(' ')[0]} {yr}
              </span>
            ))}
          </div>
        )}

        {/* Progress / count */}
        {!badge.isSpecial && (
          isGold ? (
            <p className="text-xs" style={{ color }}>
              <span className="font-bold">{badge.current.toLocaleString()}</span>
              <span className="text-muted-foreground font-normal"> total</span>
            </p>
          ) : (
            <div className="space-y-1.5">
              <ProgressBar pct={badge.progressPct} color={color} />
              <div className="flex justify-between text-[10px] font-bold tabular-nums">
                <span style={{ color: isLocked ? '#4b5563' : color }}>
                  {badge.current.toLocaleString()}
                  <span className="text-muted-foreground font-normal"> / {badge.nextThreshold?.toLocaleString() ?? '—'}</span>
                </span>
              </div>
            </div>
          )
        )}
      </button>

      <BadgeDetailModal badge={badge} open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}

// ─── Featured seasonal badge (full-width hero card) ───────────────────────────

interface FeaturedSeasonalBadgeProps {
  badge: ComputedBadge;
}

export function FeaturedSeasonalBadge({ badge }: FeaturedSeasonalBadgeProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const color = TIER_COLORS[badge.tier];
  const isLocked = badge.tier === 'locked';
  const countdown = useCountdown(badge.seasonEndDate);

  return (
    <>
      <button
        onClick={() => setModalOpen(true)}
        className="w-full text-left rounded-3xl border overflow-hidden transition-transform active:scale-[0.99] hover:opacity-95"
        style={{ borderColor: `${color}44`, background: `linear-gradient(135deg, ${color}12 0%, ${color}06 100%)` }}
      >
        {/* Seasonal label bar */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <span
            className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
            style={{ color, backgroundColor: `${color}20`, border: `1px solid ${color}44` }}
          >
            Seasonal
          </span>
          {countdown && (
            <span className="text-[10px] font-bold tabular-nums" style={{ color }}>
              {countdown} remaining
            </span>
          )}
        </div>

        {/* Main content row */}
        <div className="flex items-center gap-5 px-5 pb-5">
          {/* Big medal */}
          <div className="shrink-0">
            <MedalIcon color={color} size={64} />
            {isLocked && (
              <div className="flex justify-center mt-1">
                <Lock className="h-3.5 w-3.5" style={{ color }} />
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0 space-y-2">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h4 className={`text-lg font-bold font-headline leading-tight ${isLocked ? 'text-muted-foreground' : 'text-foreground'}`}>
                  {badge.name}
                </h4>
                <span
                  className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full shrink-0"
                  style={{ color, backgroundColor: `${color}18`, border: `1px solid ${color}33` }}
                >
                  {TIER_LABELS[badge.tier]}
                </span>
              </div>
              <p className="text-xs text-muted-foreground leading-snug">{badge.description}</p>
            </div>

            {/* Progress */}
            {!badge.isSpecial && badge.tier !== 'gold' && (
              <div className="space-y-1.5">
                <ProgressBar pct={badge.progressPct} color={color} />
                <span className="text-[11px] font-bold tabular-nums" style={{ color: isLocked ? '#4b5563' : color }}>
                  {badge.current.toLocaleString()}
                  <span className="text-muted-foreground font-normal"> / {badge.nextThreshold?.toLocaleString() ?? '—'}</span>
                </span>
              </div>
            )}

            {badge.seasonWindowText && (
              <p className="text-[10px] text-muted-foreground">Active: {badge.seasonWindowText}</p>
            )}
          </div>
        </div>
      </button>

      <BadgeDetailModal badge={badge} open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}

// ─── Coming soon card ──────────────────────────────────────────────────────────

interface ComingSoonCardProps {
  badge: ComingSoonBadge;
}

export function ComingSoonCard({ badge }: ComingSoonCardProps) {
  const color = TIER_COLORS.locked;
  return (
    <div className="flex flex-col gap-3 rounded-2xl p-4 bg-white/[0.03] border border-white/[0.06]">
      <div className="flex items-start justify-between gap-2">
        <MedalIcon color={color} size={30} />
        <span
          className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full shrink-0 text-muted-foreground"
          style={{ backgroundColor: `${color}18`, border: `1px solid ${color}33` }}
        >
          Coming Soon
        </span>
      </div>
      <div className="space-y-1">
        <p className="text-sm font-bold leading-tight text-foreground">{badge.name}</p>
        <p className="text-[11px] leading-snug text-muted-foreground/70 line-clamp-2">{badge.description}</p>
      </div>
      <p className="text-[10px] font-bold text-muted-foreground/60">Active {badge.activatesLabel}</p>
    </div>
  );
}

// ─── Tier guide ────────────────────────────────────────────────────────────────

const TIER_GUIDE: { tier: BadgeTier; label: string; desc: string }[] = [
  { tier: 'grey',   label: 'Grey',   desc: 'Just getting started' },
  { tier: 'bronze', label: 'Bronze', desc: 'Making progress' },
  { tier: 'silver', label: 'Silver', desc: 'Dedicated watcher' },
  { tier: 'gold',   label: 'Gold',   desc: 'Elite status' },
];

export function TierGuide() {
  return (
    <div className="rounded-2xl bg-white/[0.04] border border-white/[0.08] p-4">
      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">Tier Guide</p>
      <div className="grid grid-cols-4 gap-3">
        {TIER_GUIDE.map(({ tier, label, desc }) => (
          <div key={tier} className="flex flex-col items-center gap-2 text-center">
            <MedalIcon color={TIER_COLORS[tier]} size={24} />
            <span className="text-xs font-bold" style={{ color: TIER_COLORS[tier] }}>{label}</span>
            <span className="text-[10px] leading-tight text-muted-foreground">{desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
