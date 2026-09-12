"use client"

import { useEffect, useRef } from 'react';

/**
 * Loads the next page when the returned element comes near the screen — the "See
 * All" lists used to make you tap "Load more" (Keard, 2026-09-12: load as you scroll).
 *
 * Put the ref on an element after the last row. It fires a screen's height early, so
 * the next rows are usually there before you reach the bottom.
 *
 * `enabled` must be false while a page is loading and when there are no more, so it
 * never fires twice for the same page. `itemCount` re-arms it after every page: an
 * observer only reports a CHANGE, so if the new rows still don't fill the screen the
 * marker never leaves view and the next page would never be asked for.
 */
export function useLoadOnScroll(onReach: () => void, enabled: boolean, itemCount: number) {
  const ref = useRef<HTMLDivElement | null>(null);
  const latest = useRef(onReach);
  latest.current = onReach;

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      entries => { if (entries.some(e => e.isIntersecting)) latest.current(); },
      { rootMargin: '800px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [enabled, itemCount]);

  return ref;
}
