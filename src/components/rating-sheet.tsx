"use client"

import React, { useState, useEffect } from 'react';
import { Star, Film } from 'lucide-react';

interface RatingSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  poster: string;
  /** The user's existing score (1-10); 0/undefined = not rated yet. */
  currentRating?: number;
  /** Show the "Remove from Watchlist" checkbox (title is on the watchlist). */
  showWatchlistOption?: boolean;
  /** Called with the chosen score and whether to also remove from the watchlist. */
  onRate: (score: number, removeFromWatchlist: boolean) => void | Promise<void>;
  /** When set (and currentRating > 0), the sheet offers "Remove rating". */
  onRemoveRating?: () => void | Promise<void>;
}

// One rating dialog for the whole app (movie page, watchlist, lists). Same
// chrome as RefineSheet: dimmed backdrop + centered white card. The caller
// owns all side effects; this component only collects the choice.
export function RatingSheet({ open, onClose, title, poster, currentRating, showWatchlistOption, onRate, onRemoveRating }: RatingSheetProps) {
  const [selected, setSelected] = useState(0);
  const [removeWl, setRemoveWl] = useState(true);
  const [busy, setBusy] = useState(false);

  // Re-seed from the existing score each time the sheet opens.
  useEffect(() => {
    if (open) { setSelected(currentRating ?? 0); setRemoveWl(true); setBusy(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const submit = async () => {
    if (selected < 1 || busy) return;
    setBusy(true);
    try {
      await onRate(selected, !!showWatchlistOption && removeWl);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const removeRating = async () => {
    if (!onRemoveRating || busy) return;
    setBusy(true);
    try {
      await onRemoveRating();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full max-w-sm rounded-3xl flex flex-col overflow-hidden shadow-2xl border border-gray-200">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-800 transition-colors">Cancel</button>
          <span className="text-sm font-bold text-gray-900">Rate</span>
          <button
            onClick={submit}
            disabled={selected < 1 || busy}
            className="text-sm font-bold text-primary hover:opacity-80 transition-opacity disabled:opacity-30"
          >
            {busy ? 'Saving…' : 'Rate'}
          </button>
        </div>

        <div className="px-5 py-5 flex flex-col items-center gap-4">
          {/* Poster + title */}
          <div className="w-24 aspect-[2/3] rounded-xl overflow-hidden bg-gray-100 shadow-md">
            {poster ? (
              <img src={poster} alt={title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Film className="h-8 w-8 text-primary/60" />
              </div>
            )}
          </div>
          <p className="text-base font-headline font-bold text-gray-900 text-center leading-snug">
            How would you rate <span className="text-primary">{title}</span>?
          </p>

          {/* Stars */}
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => (
              <button
                key={i}
                onClick={() => setSelected(i)}
                aria-label={`${i} out of 10`}
                className="transition-all hover:scale-125 active:scale-90 p-0.5"
              >
                <Star className={`h-7 w-7 transition-colors ${selected >= i ? 'fill-primary text-primary' : 'text-gray-300 hover:text-gray-400'}`} />
              </button>
            ))}
          </div>
          <p className="text-xs font-bold text-gray-500 -mt-2">
            {selected > 0 ? `${selected}/10` : 'Select a star'}
          </p>

          {/* Watchlist checkbox — only when opened for a watchlisted title */}
          {showWatchlistOption && (
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={removeWl}
                onChange={e => setRemoveWl(e.target.checked)}
                className="h-4 w-4 accent-primary rounded"
              />
              <span className="text-sm text-gray-700">Remove from Watchlist</span>
            </label>
          )}

          {/* Remove existing rating */}
          {!!currentRating && currentRating > 0 && onRemoveRating && (
            <button
              onClick={removeRating}
              disabled={busy}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors underline underline-offset-2 disabled:opacity-50"
            >
              Remove rating
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
