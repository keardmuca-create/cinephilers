import * as Sentry from '@sentry/nextjs';

// Deployed only, for the same reason as the client half — and NODE_ENV was the
// wrong test for it. `next start` on a laptop is a production build, so a local
// verification run reported into the live project and paged Keard about an error
// nobody could see. VERCEL_ENV exists only on a real deployment.
export async function register() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  const deployed = process.env.VERCEL_ENV === 'production';
  if (!deployed && process.env.NEXT_PUBLIC_SENTRY_DEBUG_LOCAL !== '1') return;
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    // The TMDB key rides in the query string of every outbound call, and the
    // default HTTP instrumentation records request URLs. Strip it before an
    // event leaves the process rather than storing a credential in Sentry.
    beforeBreadcrumb(crumb) {
      const url = crumb.data?.url;
      if (typeof url === 'string' && url.includes('api_key=')) {
        crumb.data!.url = url.replace(/api_key=[^&]*/g, 'api_key=REDACTED');
      }
      return crumb;
    },
  });
}

export const onRequestError = Sentry.captureRequestError;
