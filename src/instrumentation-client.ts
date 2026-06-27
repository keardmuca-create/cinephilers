import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
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
