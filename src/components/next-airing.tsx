"use client"

import React from 'react';
import { CalendarClock } from 'lucide-react';
import type { NextEpisode } from '@/lib/types';

/**
 * "Airs today", "Airs tomorrow", "Airs Sunday" for the coming week, then a date.
 * A weekday is how people actually hold a show in their head — "the new one's on
 * Sunday" — and it only stays useful while it is close, so anything further out
 * falls back to a real date.
 */
function whenText(airDate: string): string | null {
  const air = new Date(`${airDate}T00:00:00`);
  if (isNaN(air.getTime())) return null;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const days = Math.round((air.getTime() - startOfToday.getTime()) / 86_400_000);

  // TMDB can lag a day or two after broadcast before it moves the pointer on.
  // Saying an episode airs in the past would be worse than saying nothing.
  if (days < 0) return null;
  if (days === 0) return 'Airs today';
  if (days === 1) return 'Airs tomorrow';
  if (days <= 6) return `Airs ${air.toLocaleDateString(undefined, { weekday: 'long' })}`;
  return `Airs ${air.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}`;
}

export function NextAiring({ next }: { next?: NextEpisode }) {
  if (!next) return null;
  const when = whenText(next.airDate);
  if (!when) return null;

  const isFinale = next.episodeType === 'finale';

  return (
    <section>
      <div className="flex items-center gap-3 bg-primary/5 border border-primary/30 rounded-2xl px-4 py-3">
        <CalendarClock className="h-5 w-5 text-primary shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-bold">
            {when}
            <span className="text-muted-foreground font-semibold"> · S{next.season}E{next.episode}</span>
            {isFinale && <span className="text-primary font-bold"> · Finale</span>}
          </p>
          {/* TMDB often names an unaired episode "Episode 8", which is no more
              than the number already shown — so it is only printed when it says
              something. */}
          {next.name && !/^episode \d+$/i.test(next.name.trim()) && (
            <p className="text-xs text-muted-foreground truncate">{next.name}</p>
          )}
        </div>
      </div>
    </section>
  );
}
