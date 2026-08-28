"use client"

import React from 'react';
import type { BadgeTierName } from '@/lib/badge-defs';

// One medal, hung from a ribbon. Every badge wears the same one and only the
// metal changes — bronze, silver, gold.
//
// The form never varies: no per-badge emblem, no laurels that sprout at silver.
// In a row the name and the count sit right beside it, so the medal was never
// what told you WHICH badge this is. It tells you how far you got, and puts the
// mark at the centre of every one.
//
// Unearned is the same medal drained of metal, with a ring showing how close you
// are — so the shape is familiar long before it's won.

const CRIMSON = 'hsl(348, 83%, 47%)';

// The ribbon is the app's colour, not the tier's. It used to be tinted to match
// the metal, which meant a bronze medal was brown from top to bottom and the
// three tiers read as three different objects. One crimson ribbon makes them one
// medal that changes metal — and it's the same crimson as the C at the centre.
const RIBBON = CRIMSON;
const RIBBON_EDGE = 'hsl(348, 83%, 32%)';

interface Metal {
  face: string;
  inner: string;
  edge: string;
}

const METALS: Record<BadgeTierName, Metal> = {
  bronze: { face: '#C87F45', inner: '#E0A570', edge: '#7A4718' },
  silver: { face: '#A8AAB2', inner: '#D5D7DD', edge: '#6B6D75' },
  gold:   { face: '#D9A72C', inner: '#F3D072', edge: '#8A6510' },
};

export function BadgeMedal({ tier, progress = 0, size = 56 }: {
  tier: BadgeTierName | null;
  /** 0–1 toward the next threshold. Only drawn when unearned. */
  progress?: number;
  size?: number;
}) {
  // The ribbon adds height above the disc, so the box is taller than it is wide.
  const height = Math.round(size * 1.3);
  const CY = 46;
  const R = 26;
  const markR = 12.5;

  const ribbonPath = 'M22 0 H50 L44 20 H28 Z';
  const muted = 'var(--muted-foreground, #888)';

  if (!tier) {
    const circumference = 2 * Math.PI * R;
    return (
      <div className="relative shrink-0" style={{ width: size, height }}>
        <svg viewBox="0 0 72 94" width={size} height={height} aria-hidden>
          <path d={ribbonPath} fill="currentColor" className="text-muted-foreground/20" />
          <circle cx="36" cy={CY} r={R} fill="currentColor" className="text-muted-foreground/5" />
          <circle cx="36" cy={CY} r={R} fill="none" stroke="currentColor" strokeWidth="3" className="text-muted-foreground/15" />
          <circle
            cx="36" cy={CY} r={R} fill="none" strokeWidth="3" strokeLinecap="round"
            stroke="currentColor" className="text-muted-foreground/60"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - Math.max(0, Math.min(1, progress)))}
            transform={`rotate(-90 36 ${CY})`}
          />
          <circle cx="36" cy={CY} r={markR} fill="currentColor" className="text-muted-foreground/10" />
          <text
            x="36" y={CY + 6} textAnchor="middle"
            fontFamily="Georgia, serif" fontWeight="700" fontSize="18"
            fill={muted} opacity="0.55"
          >
            C
          </text>
        </svg>
      </div>
    );
  }

  const m = METALS[tier];

  return (
    <div className="relative shrink-0" style={{ width: size, height }}>
      <svg viewBox="0 0 72 94" width={size} height={height} aria-hidden>
        {/* Ribbon */}
        <path d={ribbonPath} fill={RIBBON} stroke={RIBBON_EDGE} strokeWidth="1" strokeLinejoin="round" />
        <path d="M36 0 V20" stroke={RIBBON_EDGE} strokeWidth="0.75" opacity="0.35" />

        {/* Disc — a plain circle. No milling, no notches; the metal does the work. */}
        <circle cx="36" cy={CY} r={R} fill={m.face} stroke={m.edge} strokeWidth="1.5" />
        <circle cx="36" cy={CY} r={R - 4} fill={m.inner} />
        <circle cx="36" cy={CY} r={R - 4} fill="none" stroke={m.edge} strokeWidth="0.75" opacity="0.5" />

        {/* The mark — a white disc with the crimson C, the same shape as the app icon */}
        <circle cx="36" cy={CY} r={markR} fill="#FFFFFF" stroke={m.edge} strokeWidth="0.75" opacity="0.98" />
        <text
          x="36" y={CY + 6} textAnchor="middle"
          fontFamily="Georgia, serif" fontWeight="700" fontSize="18" fill={CRIMSON}
        >
          C
        </text>
      </svg>
    </div>
  );
}
