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
    ],
    denyUrls: [
      /^chrome-extension:\/\//,
      /^moz-extension:\/\//,
      /^safari-(web-)?extension:\/\//,
    ],
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
