"use client"

import { Film, Tv } from 'lucide-react';
import { SIDE_LABELS, type MediaSide } from '@/lib/media-type';

// The Movies | Shows pill, lifted out of Top Picks so every list wears the same
// control. Films and shows are counted and filtered separately everywhere, and
// there is deliberately no "All" — a combined list would undo the split.
//
// Counts are optional and shown inside the pill. That is the split count itself
// ("558 films · 7 shows") sitting where the eye already is, rather than a second
// line repeating it.
export function MediaToggle({ value, onChange, counts, className = '' }: {
  value: MediaSide;
  onChange: (side: MediaSide) => void;
  counts?: Partial<Record<MediaSide, number>>;
  className?: string;
}) {
  const sides: { side: MediaSide; Icon: typeof Film }[] = [
    { side: 'movies', Icon: Film },
    { side: 'shows', Icon: Tv },
  ];

  return (
    <div className={`flex items-center bg-muted rounded-full p-1 border border-border w-full ${className}`}>
      {sides.map(({ side, Icon }) => {
        const active = value === side;
        const count = counts?.[side];
        return (
          <button
            key={side}
            type="button"
            onClick={() => onChange(side)}
            aria-pressed={active}
            className={[
              'flex flex-1 items-center justify-center gap-1.5 py-2 rounded-full text-xs font-bold transition-all',
              active ? 'bg-primary text-white shadow' : 'text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            <Icon className="h-3 w-3" /> {SIDE_LABELS[side]}
            {count !== undefined && (
              <span className={active ? 'text-white/75' : 'text-muted-foreground/60'}>{count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
