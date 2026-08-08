"use client"

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, ChevronRight, X, Sparkles } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { ImportDialog } from '@/components/import-dialog';
import { isEpisodeId } from '@/lib/media-id';

// The rest of onboarding, on the home screen rather than in front of it.
//
// The welcome screen asks one question and gets out of the way. Everything else a
// new account needs — a watchlist, ideally a history — lives here, where it can
// keep nudging over several visits instead of getting one shot at the door. The
// step that matters is the watchlist: Today's Pick draws from it, and both pick
// badges are unreachable until it has something in it. An empty watchlist is the
// difference between an app that does something for you and a catalogue.
//
// It disappears on its own once the steps are done, and can be dismissed before
// then. Nobody is nagged forever.

const DISMISS_KEY = 'get-started-dismissed';
const WATCHLIST_TARGET = 5;

function countLocal(prefix: string, skipEpisodes: boolean): number {
  let n = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(prefix)) continue;
      const id = k.slice(prefix.length);
      if (skipEpisodes && isEpisodeId(id)) continue;
      if (prefix === 'watched-' && localStorage.getItem(k) !== 'true') continue;
      n++;
    }
  } catch { /* ignore */ }
  return n;
}

function Step({ done, title, detail, onClick, href }: {
  done: boolean;
  title: string;
  detail: string;
  onClick?: () => void;
  href?: string;
}) {
  const inner = (
    <>
      <span
        className={`h-6 w-6 rounded-full border flex items-center justify-center shrink-0 ${
          done ? 'bg-primary border-primary text-primary-foreground' : 'border-border text-transparent'
        }`}
      >
        <Check className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-sm font-bold ${done ? 'line-through text-muted-foreground' : ''}`}>
          {title}
        </span>
        <span className="block text-xs text-muted-foreground">{detail}</span>
      </span>
      {!done && <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
    </>
  );

  const className = 'w-full flex items-center gap-3 text-left py-2';
  if (done) return <div className={className}>{inner}</div>;
  if (href) return <Link href={href} className={className}>{inner}</Link>;
  return <button type="button" onClick={onClick} className={className}>{inner}</button>;
}

export function GetStarted() {
  const { user, loading } = useAuth();
  const [hidden, setHidden] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [counts, setCounts] = useState({ watchlist: 0, watched: 0 });

  const read = useCallback(() => {
    setCounts({
      watchlist: countLocal('watchlist-', true),
      watched: countLocal('watched-', true),
    });
  }, []);

  useEffect(() => {
    let dismissed = false;
    try { dismissed = localStorage.getItem(DISMISS_KEY) === 'true'; } catch { /* ignore */ }
    setHidden(dismissed);
    read();
  }, [read]);

  // The same events the profile listens to, so ticking a step off elsewhere in
  // the app is reflected without a reload.
  useEffect(() => {
    const handler = () => read();
    window.addEventListener('cinephilers-watched-changed', handler);
    window.addEventListener('cinephilers-db-restored', handler);
    window.addEventListener('focus', handler);
    return () => {
      window.removeEventListener('cinephilers-watched-changed', handler);
      window.removeEventListener('cinephilers-db-restored', handler);
      window.removeEventListener('focus', handler);
    };
  }, [read]);

  if (loading || !user || hidden) return null;

  const genresDone = (user.favoriteGenres?.length ?? 0) > 0;
  const watchlistDone = counts.watchlist >= WATCHLIST_TARGET;
  // Either route out of an empty library counts: bringing a history over, or
  // building one here. Asking someone to do both would be asking twice.
  const libraryDone = counts.watched > 0;

  if (genresDone && watchlistDone && libraryDone) return null;

  const dismiss = () => {
    setHidden(true);
    try { localStorage.setItem(DISMISS_KEY, 'true'); } catch { /* ignore */ }
  };

  const doneCount = [genresDone, watchlistDone, libraryDone].filter(Boolean).length;

  return (
    <section className="px-6 pt-6 -mb-4">
      <div className="relative bg-primary/5 border border-primary/20 rounded-2xl p-5 max-w-3xl mx-auto">
        <button
          onClick={dismiss}
          aria-label="Dismiss get started"
          className="absolute top-3 right-3 p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-2 mb-2 pr-6">
          <Sparkles className="h-4 w-4 text-primary shrink-0" />
          <p className="font-bold text-base">Get started</p>
          <span className="text-xs text-muted-foreground font-semibold">{doneCount} of 3</span>
        </div>

        <div className="divide-y divide-border/60">
          <Step
            done={genresDone}
            title="Tell us what you watch"
            detail={genresDone ? 'Done' : 'A few genres, so suggestions are about you'}
            href="/welcome"
          />
          <Step
            done={libraryDone}
            title="Bring your history over"
            detail={libraryDone ? 'Done' : 'Import from Letterboxd or IMDb — or just mark a film watched'}
            onClick={() => setShowImport(true)}
          />
          <Step
            done={watchlistDone}
            title="Fill your watchlist"
            detail={
              watchlistDone
                ? 'Done'
                : `${counts.watchlist} of ${WATCHLIST_TARGET} films — Today's Pick chooses from these`
            }
            href="/browse"
          />
        </div>
      </div>

      {showImport && <ImportDialog onClose={() => { setShowImport(false); read(); }} />}
    </section>
  );
}
