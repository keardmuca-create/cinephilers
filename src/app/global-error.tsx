"use client"

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a', color: '#fafafa', fontFamily: 'sans-serif' }}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: 24, marginBottom: 8 }}>Something went wrong</h2>
          <p style={{ opacity: 0.6, marginBottom: 24 }}>We&apos;ve been notified and are looking into it.</p>
          <button onClick={reset} style={{ padding: '10px 24px', borderRadius: 9999, border: 'none', background: '#fafafa', color: '#0a0a0a', fontWeight: 700, cursor: 'pointer' }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
