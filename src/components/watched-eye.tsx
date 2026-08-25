import React from 'react';
import { Eye } from 'lucide-react';
import { cn } from '@/lib/utils';

// One mark, three states, everywhere in the app:
//
//   a solid eye   — finished (a watched film, a completed show)
//   a hollow eye  — a show started but not finished
//   nothing       — never touched
//
// Solid and hollow, not bright and dim: the difference has to survive a phone in
// daylight, and a dimmed icon reads as a disabled control rather than a lesser
// state. The hollow one is the eye the app has always used, unchanged.

interface WatchedEyeProps {
  state: 'partial' | 'complete';
  /** Tailwind size classes — `h-4 w-4` unless the surface calls for smaller. */
  className?: string;
}

export function WatchedEye({ state, className }: WatchedEyeProps) {
  const size = className ?? 'h-4 w-4';

  if (state === 'partial') {
    return <Eye aria-hidden="true" className={cn('text-primary shrink-0', size)} />;
  }

  // Solid: one filled path whose ring and pupil are wound the other way, so the
  // sclera punches through to whatever is behind it in either theme.
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={cn('text-primary shrink-0', size)}
    >
      <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
    </svg>
  );
}
