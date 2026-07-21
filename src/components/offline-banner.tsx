"use client"

import React, { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

// A slim branded pill that appears when the connection drops mid-use and
// auto-hides when it returns — so a dropped signal shows something on-theme
// instead of letting content silently fail. Non-blocking: cached content
// stays visible underneath.
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    // Sync with the real state on mount (e.g. app opened already offline).
    setOffline(!navigator.onLine);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      className="fixed left-0 right-0 z-[110] flex justify-center px-4 pointer-events-none"
      style={{ top: 'calc(env(safe-area-inset-top) + 0.5rem)' }}
    >
      <div className="pointer-events-auto flex items-center gap-2.5 rounded-full bg-card border border-border shadow-xl px-4 py-2.5">
        <WifiOff className="h-4 w-4 text-primary shrink-0" />
        <span className="text-sm font-semibold text-foreground">No connection</span>
        <span className="text-xs text-muted-foreground">Check your internet</span>
      </div>
    </div>
  );
}
