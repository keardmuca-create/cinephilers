"use client"

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { useAuth } from '@/contexts/auth-context';

// The one screen shown before the app.
//
// It asks a single question, because a five-step wizard in front of a film app
// somebody found on TikTok is how you lose them before they see a poster. This is
// three taps and it pays off immediately: `favoriteGenres` already feeds the Top
// Picks backfill, so the difference between answering and skipping is whether the
// home screen's recommendations are about them or a generic top-rated list.
//
// Everything else onboarding needs — the import, filling a watchlist — lives in
// the Get started card on the home screen, where it can keep nudging over days
// instead of getting one shot at the door.

// TMDB's own genre names, spelled exactly as GENRE_MAP has them, because
// genreNameToId matches on the string. Daily-television genres are not offered,
// for the same reason they are kept off the home screen. Documentary is here —
// it belongs on a home screen, it just isn't everyone's taste.
const GENRES = [
  'Action', 'Adventure', 'Animation', 'Comedy',
  'Crime', 'Documentary', 'Drama', 'Family',
  'Fantasy', 'History', 'Horror', 'Mystery',
  'Romance', 'Sci-Fi', 'Thriller', 'War', 'Western',
];

const SKIP_KEY = 'onboarding-genres-skipped';

export default function WelcomePage() {
  const router = useRouter();
  const { refetch } = useAuth();
  const [picked, setPicked] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const toggle = (g: string) =>
    setPicked(p => (p.includes(g) ? p.filter(x => x !== g) : [...p, g]));

  const leave = () => {
    router.replace('/home');
    router.refresh();
  };

  const skip = () => {
    // Remembered locally, not on the account. Answering is stored server-side and
    // follows you everywhere; skipping only silences this device, which is the
    // right way round — a skip is "not now", not a preference worth syncing.
    try { localStorage.setItem(SKIP_KEY, 'true'); } catch { /* ignore */ }
    leave();
  };

  const save = async () => {
    if (picked.length === 0 || saving) return;
    setSaving(true);
    try {
      const res = await fetchWithAuth('/api/users/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favoriteGenres: picked }),
      });
      // A failed save is not worth trapping anyone on this screen. The Get started
      // card on the home screen still shows the step as outstanding, so it can be
      // done again from there.
      if (res.ok) await refetch();
    } catch { /* ignore */ }
    leave();
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-background">
      <div className="w-full max-w-lg space-y-8">
        <div className="text-center space-y-3">
          <div className="h-14 w-14 rounded-2xl bg-primary/15 border border-primary/25 flex items-center justify-center mx-auto">
            <Sparkles className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-3xl font-headline font-bold">What do you watch?</h1>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Pick a few you like. We&apos;ll use them to suggest films worth your evening —
            you can change them any time in your profile.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 justify-center">
          {GENRES.map(g => {
            const on = picked.includes(g);
            return (
              <button
                key={g}
                type="button"
                onClick={() => toggle(g)}
                aria-pressed={on}
                className={`rounded-full px-4 py-2 text-sm font-bold border transition-colors flex items-center gap-1.5 ${
                  on
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-muted/40 text-foreground border-border hover:bg-muted'
                }`}
              >
                {on && <Check className="h-3.5 w-3.5" />}
                {g}
              </button>
            );
          })}
        </div>

        <div className="space-y-3">
          <Button
            onClick={save}
            disabled={picked.length === 0 || saving}
            className="w-full rounded-full h-12 font-bold text-base"
          >
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Continue'}
          </Button>
          <button
            type="button"
            onClick={skip}
            className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
          >
            Skip for now
          </button>
        </div>
      </div>
    </main>
  );
}
