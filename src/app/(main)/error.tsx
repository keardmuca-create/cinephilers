"use client"

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { CircleAlert } from 'lucide-react';

// Segment-level boundary. Without one, a render error anywhere under (main)
// escalates to global-error, which replaces the entire document — nav bar and
// all — so a broken row on one page reads as the whole app going down. This
// catches it inside the layout instead: the shell and navigation survive, and
// the person can move to another page without reloading.
export default function MainError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="min-h-[70vh] bg-background text-foreground flex flex-col items-center justify-center px-6 text-center">
      <div className="h-20 w-20 rounded-3xl bg-primary/10 flex items-center justify-center mb-6">
        <CircleAlert className="h-10 w-10 text-primary" />
      </div>
      <h2 className="text-2xl font-headline font-bold mb-4">This page didn&apos;t load</h2>
      <p className="text-muted-foreground mb-8 max-w-sm">
        Something broke while putting this page together. It&apos;s been reported. Trying again
        often works — the rest of the app is fine.
      </p>
      <button
        onClick={reset}
        className="bg-primary text-white font-bold px-6 py-3 rounded-full hover:bg-primary/90 transition-colors text-sm"
      >
        Try again
      </button>
    </main>
  );
}
