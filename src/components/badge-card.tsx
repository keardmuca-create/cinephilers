
"use client"

import React, { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { ComputedBadge, ComingSoonBadge, TIER_COLORS, TIER_LABELS, BadgeTier } from '@/lib/badges';

// ─── Medal SVG icon ────────────────────────────────────────────────────────────

export function MedalIcon({ color, size = 28 }: { color: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Left ribbon strap */}
      <rect x="9" y="1.5" width="2.2" height="7" rx="1.1" fill={color} fillOpacity="0.75" />
      {/* Right ribbon strap */}
      <rect x="12.8" y="1.5" width="2.2" height="7" rx="1.1" fill={color} fillOpacity="0.75" />
      {/* Outer circle */}
      <circle cx="12" cy="16" r="6.5" fill={color} fillOpacity="0.12" stroke={color} strokeWidth="1.5" />
      {/* Inner filled circle */}
      <circle cx="12" cy="16" r="3.5" fill={color} fillOpacity="0.3" />
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
      if (d > 0) setLabel(`${d}d ${h}h ${m}m`);
      else if (h > 0) setLabel(`${h}h ${m}m`);
      else setLabel(`${m}m`);
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [target]);

  return label;
}

// ─── Progress bar ──────────────────────────────────────────────────────────────

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

// ─── Badge card ────────────────────────────────────────────────────────────────

interface BadgeCardProps {
  badge: ComputedBadge;
}

export function BadgeCard({ badge }: BadgeCardProps) {
  const color    = TIER_COLORS[badge.tier];
  const isGold   = badge.tier === 'gold';
  const isLocked = badge.tier === 'locked';
  const countdown = useCountdown(badge.isSeasonal && badge.isSeasonActive ? badge.seasonEndDate : undefined);

  return (
    <div
      className="relative flex flex-col gap-3 rounded-2xl p-4 bg-white/5 border border-white/[0.08] transition-colors duration-200 hover:bg-white/[0.07]"
      style={{ borderColor: `${color}33` }}
    >
      {/* Icon row */}
      <div className="flex items-start justify-between gap-2">
        <div className="relative">
          <MedalIcon color={color} size={30} />
          {isLocked && (
            <div className="absolute -bottom-1 -right-1 bg-background rounded-full p-0.5">
              <Lock className="h-2.5 w-2.5" style={{ color }} />
            </div>
          )}
        </div>

        {/* Tier pill */}
        <span
          className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full shrink-0"
          style={{ color, backgroundColor: `${color}18`, border: `1px solid ${color}33` }}
        >
          {TIER_LABELS[badge.tier]}
        </span>
      </div>

      {/* Name + description */}
      <div className="space-y-1">
        <p className="text-sm font-bold leading-tight" style={{ color: isLocked ? '#6b7280' : '#f3f4f6' }}>
          {badge.name}
        </p>
        <p className="text-[11px] leading-snug text-muted-foreground line-clamp-2">
          {badge.description}
        </p>
      </div>

      {/* Special — Founder member since */}
      {badge.isSpecial && badge.memberSince && (
        <p className="text-[11px] font-medium" style={{ color }}>
          Member since {badge.memberSince}
        </p>
      )}

      {/* Seasonal active countdown */}
      {badge.isSeasonal && badge.isSeasonActive && countdown && (
        <p className="text-[10px] font-bold" style={{ color }}>
          {countdown} remaining
        </p>
      )}

      {/* Earned years chips */}
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
              <span style={{ color: isLocked ? '#4b5563' : color }}>{badge.current.toLocaleString()}</span>
              <span className="text-muted-foreground">{badge.nextThreshold?.toLocaleString() ?? '—'}</span>
            </div>
          </div>
        )
      )}
    </div>
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
        <p className="text-sm font-bold leading-tight text-muted-foreground">{badge.name}</p>
        <p className="text-[11px] leading-snug text-muted-foreground/70 line-clamp-2">{badge.description}</p>
      </div>

      <p className="text-[10px] font-bold text-muted-foreground/60">
        Active {badge.activatesLabel}
      </p>
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
