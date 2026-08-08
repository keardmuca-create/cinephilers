import * as Sentry from '@sentry/nextjs';

// Production only. Sentry defaults its environment to NODE_ENV, so a local dev
// server was reporting into the same project as the live site and tripping the
// production alert rule — an error that existed for ninety seconds while a file
// was half-edited would page Keard as though cinephilers.app were down. Nothing
// thrown by a dev server is worth an alert, so it is not sent at all.
//
// Set SENTRY_DEBUG_LOCAL=1 in .env.local to turn it on locally when testing
// Sentry itself.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const enabled =
  !!dsn &&
  (process.env.NODE_ENV === 'production' || process.env.NEXT_PUBLIC_SENTRY_DEBUG_LOCAL === '1');

if (enabled) {
  Sentry.init({
    dsn,
    // Stated rather than inferred, so the environment on an event never depends
    // on how the process happened to be started.
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    // Drop noise from visitors' browser extensions, not our code. Our strict CSP
    // blocks the inline scripts these extensions inject, which throws errors like
    // "nonce is not defined" that have nothing to do with the app.
    ignoreErrors: [
      'nonce is not defined',
      // Generic extension/injection noise commonly captured by the global handler
      'Non-Error promise rejection captured',
      "Can't find variable: nonce",
      // A fetch that was aborted or failed on a flaky/backgrounded mobile
      // connection. Safari words it "Load failed", Chrome/Firefox "Failed to
      // fetch". Our own data fetches all .catch and fall back to cached data,
      // so these only surface as unhandled rejections from library-level
      // requests (Next.js route prefetch, Sentry's transport) we can't wrap —
      // pure network noise, not an app fault.
      'Load failed',
      'Failed to fetch',
    ],
    denyUrls: [
      /^chrome-extension:\/\//,
      /^moz-extension:\/\//,
      /^safari-(web-)?extension:\/\//,
    ],
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
