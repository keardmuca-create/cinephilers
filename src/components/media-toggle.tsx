"use client"

import { Film, Tv, Clapperboard } from 'lucide-react';
import { SIDE_LABELS, type MediaSide } from '@/lib/media-type';

// The Movies | Shows pill, lifted out of Top Picks so every list wears the same
// control. Films and shows are counted and filtered separately everywhere, and
// there is deliberately no "All" — a combined list would undo the split.
//
// Counts are optional and shown inside the pill. That is the split count itself
// ("558 films · 7 shows") sitting where the eye already is, rather than a second
// line repeating it.
// Episodes is a third segment rather than a switch hidden under Shows. It is
// where the app already counts them — "568 films · 319 episodes" has always been
// the header — and the rule is that you split where you COUNT and mix where each
// row names itself. A show stays one row on the Shows side no matter how many of
// its episodes you have seen; Episodes is the view where each one is its own row,
// with the night you watched it. Lists that have no episodes to show simply do
// not pass the segment.
export function MediaToggle({ value, onChange, counts, sides: allowed, className = '' }: {
  value: MediaSide;
  onChange: (side: MediaSide) => void;
  counts?: Partial<Record<MediaSide, number>>;
  /** Which segments to render, in order. Defaults to films and shows only. */
  sides?: MediaSide[];
  className?: string;
}) {
  const ICONS: Record<MediaSide, typeof Film> = { movies: Film, shows: Tv, episodes: Clapperboard };
  const shown = allowed ?? ['movies', 'shows'];

  return (
    <div className={`flex items-center bg-muted rounded-full p-1 border border-border w-full ${className}`}>
      {shown.map(side => {
        const Icon = ICONS[side];
        const active = value === side;
        const count = counts?.[side];
        return (
          <button
            key={side}
            type="button"
            onClick={() => onChange(side)}
            aria-pressed={active}
            className={[
              // gap-1 and px-1 rather than gap-1.5: with three segments the
              // widest label and its count have about 106px on a 375px phone,
              // and the old spacing spent the last of it on air.
              'flex flex-1 items-center justify-center gap-1 px-1 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap',
              active ? 'bg-primary text-white shadow' : 'text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            <Icon className="h-3 w-3 shrink-0" /> {SIDE_LABELS[side]}
            {count !== undefined && (
              <span className={active ? 'text-white/75' : 'text-muted-foreground/60'}>{count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
