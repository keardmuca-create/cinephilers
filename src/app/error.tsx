"use client"

import { useEffect } from 'react';
import Link from 'next/link';
import * as Sentry from '@sentry/nextjs';
import { CircleAlert } from 'lucide-react';

// Root boundary for everything that isn't inside (main) — film and show pages,
// person pages, the static pages. Those have no shell to preserve, so this is a
// full-page state, but it still keeps the app mounted and offers a way out
// rather than dropping to global-error's bare document.
export default function RootError({
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
    <main className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center px-6 text-center">
      <div className="h-20 w-20 rounded-3xl bg-primary/10 flex items-center justify-center mb-6">
        <CircleAlert className="h-10 w-10 text-primary" />
      </div>
      <h2 className="text-2xl font-headline font-bold mb-4">Something went wrong</h2>
      <p className="text-muted-foreground mb-8 max-w-sm">
        This page hit an error while loading. It&apos;s been reported and we&apos;re looking into
        it.
      </p>
      <div className="flex items-center gap-3">
        <button
          onClick={reset}
          className="bg-primary text-white font-bold px-6 py-3 rounded-full hover:bg-primary/90 transition-colors text-sm"
        >
          Try again
        </button>
        <Link
          href="/home"
          className="border border-border font-bold px-6 py-3 rounded-full hover:bg-muted transition-colors text-sm"
        >
          Back to browsing
        </Link>
      </div>
    </main>
  );
}
