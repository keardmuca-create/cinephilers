"use client"

import React, { useState } from 'react';
import { EyeOff } from 'lucide-react';

// Blurs review text flagged as a spoiler behind a "tap to reveal" overlay so a
// reader doesn't see it by accident. Non-spoiler content renders untouched.
// Safe inside a clickable card — revealing stops the click from bubbling.
export function SpoilerWrap({ isSpoiler, children }: { isSpoiler?: boolean; children: React.ReactNode }) {
  const [revealed, setRevealed] = useState(false);
  if (!isSpoiler || revealed) return <>{children}</>;

  return (
    <div className="relative">
      <div className="blur-sm select-none pointer-events-none" aria-hidden>{children}</div>
      <button
        type="button"
        onClick={e => { e.preventDefault(); e.stopPropagation(); setRevealed(true); }}
        className="absolute inset-0 flex items-center justify-center gap-1.5 rounded-lg bg-background/30 hover:bg-background/10 transition-colors"
      >
        <EyeOff className="h-3.5 w-3.5 text-yellow-500" />
        <span className="text-xs font-bold text-yellow-500">Spoiler — tap to reveal</span>
      </button>
    </div>
  );
}
