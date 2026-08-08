import * as Sentry from '@sentry/nextjs';

// Production only, for the same reason as the client half: a dev server's errors
// were landing in the live project and firing the production alert rule.
export async function register() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  if (process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_SENTRY_DEBUG_LOCAL !== '1') return;
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
  });
}

export const onRequestError = Sentry.captureRequestError;
