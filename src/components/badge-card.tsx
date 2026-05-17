
"use client"

import React, { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { ComputedBadge, TIER_COLORS, TIER_LABELS, BadgeTier } from '@/lib/badges';

// ─── Countdown timer ──────────────────────────────────────────────────────────

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

// ─── Shimmer keyframes injected once ─────────────────────────────────────────

let shimmerInjected = false;
function injectShimmer() {
  if (shimmerInjected || typeof document === 'undefined') return;
  shimmerInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    @keyframes badge-shimmer {
      0%   { background-position: -200% center; }
      100% { background-position: 200% center; }
    }
    @keyframes badge-glow-pulse {
      0%, 100% { box-shadow: 0 0 8px 2px var(--badge-glow-color, #ffd700); }
      50%       { box-shadow: 0 0 20px 6px var(--badge-glow-color, #ffd700); }
    }
    .badge-gold-shimmer {
      background: linear-gradient(
        105deg,
        #ffd700 0%,
        #fffde4 40%,
        #ffd700 60%,
        #b8860b 100%
      );
      background-size: 200% auto;
      animation: badge-shimmer 2.5s linear infinite;
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .badge-card-glow {
      animation: badge-glow-pulse 2s ease-in-out infinite;
    }
    .badge-progress-glow {
      box-shadow: 0 0 6px 1px var(--progress-glow, transparent);
    }
  `;
  document.head.appendChild(style);
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ pct, color, tier }: { pct: number; color: string; tier: BadgeTier }) {
  return (
    <div
      className="w-full h-1.5 rounded-full overflow-hidden"
      style={{ backgroundColor: `${color}22` }}
    >
      <div
        className="h-full rounded-full transition-all duration-700 badge-progress-glow"
        style={{
          width: `${Math.min(pct, 100)}%`,
          backgroundColor: color,
          // @ts-expect-error CSS custom property
          '--progress-glow': tier !== 'locked' ? `${color}88` : 'transparent',
        }}
      />
    </div>
  );
}

// ─── Main badge card ──────────────────────────────────────────────────────────

interface BadgeCardProps {
  badge: ComputedBadge;
}

export function BadgeCard({ badge }: BadgeCardProps) {
  useEffect(() => { injectShimmer(); }, []);

  const color = TIER_COLORS[badge.tier];
  const tierLabel = TIER_LABELS[badge.tier];
  const isGold = badge.tier === 'gold';
  const isLocked = badge.tier === 'locked';

  const countdown = useCountdown(
    badge.isSeasonal ? badge.seasonEndDate : undefined,
  );

  const borderColor = isLocked ? '#374151' : color;

  return (
    <div
      className={`
        relative flex flex-col gap-3 rounded-2xl p-4 bg-white/5 border transition-all duration-300
        hover:scale-[1.02] hover:bg-white/8
        ${isGold ? 'badge-card-glow' : ''}
      `}
      style={{
        borderColor: `${borderColor}55`,
        // @ts-expect-error CSS custom property
        '--badge-glow-color': color,
      }}
    >
      {/* Icon + tier name row */}
      <div className="flex items-start justify-between">
        <div className="flex flex-col items-start gap-1">
          {/* Emoji icon tinted by tier */}
          <div
            className="text-3xl leading-none select-none"
            style={{ filter: isLocked ? 'grayscale(1) brightness(0.4)' : undefined }}
          >
            {isLocked ? <Lock className="h-7 w-7" style={{ color }} /> : badge.emoji}
          </div>
        </div>

        {/* Tier pill */}
        <span
          className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
          style={{
            color,
            backgroundColor: `${color}22`,
            border: `1px solid ${color}44`,
          }}
        >
          {tierLabel}
        </span>
      </div>

      {/* Name */}
      <div>
        <p
          className={`text-sm font-bold leading-tight ${isGold ? 'badge-gold-shimmer' : ''}`}
          style={!isGold ? { color: isLocked ? '#6b7280' : '#f3f4f6' } : undefined}
        >
          {badge.name}
        </p>

        {/* Special: Founder member since */}
        {badge.isSpecial && badge.memberSince && (
          <p className="text-xs text-muted-foreground mt-0.5">Member since {badge.memberSince}</p>
        )}

        {/* Seasonal label */}
        {badge.isSeasonal && badge.seasonLabel && (
          <p className="text-[10px] text-muted-foreground mt-0.5 font-medium">{badge.seasonLabel}</p>
        )}
      </div>

      {/* Seasonal: active countdown or locked hint */}
      {badge.isSeasonal && (
        <div className="text-[10px] font-bold" style={{ color: badge.isSeasonActive ? color : '#6b7280' }}>
          {badge.isSeasonActive
            ? `⏱ ${countdown} left`
            : `Starts ${badge.seasonEndDate?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
        </div>
      )}

      {/* Earned years for seasonal */}
      {badge.isSeasonal && (badge.seasonEarnedYears?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1">
          {badge.seasonEarnedYears!.map(yr => (
            <span
              key={yr}
              className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ color: TIER_COLORS.gold, backgroundColor: `${TIER_COLORS.gold}22`, border: `1px solid ${TIER_COLORS.gold}44` }}
            >
              {badge.seasonLabel?.split(' ')[0]} {yr}
            </span>
          ))}
        </div>
      )}

      {/* Progress bar + count — not shown for special or gold non-seasonal */}
      {!badge.isSpecial && (
        <>
          {isGold ? (
            // Gold: show total count only
            <p className="text-xs font-bold" style={{ color }}>
              {badge.current.toLocaleString()}{' '}
              <span className="font-normal text-muted-foreground">total</span>
            </p>
          ) : (
            <div className="space-y-1.5">
              <ProgressBar pct={badge.progressPct} color={color} tier={badge.tier} />
              <div className="flex justify-between text-[10px] font-bold">
                <span style={{ color: isLocked ? '#6b7280' : color }}>{badge.current.toLocaleString()}</span>
                <span className="text-muted-foreground">{badge.nextThreshold?.toLocaleString() ?? '—'}</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
