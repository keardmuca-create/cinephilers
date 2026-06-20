import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

if (!process.env.JWT_ACCESS_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_ACCESS_SECRET must be set in production');
}
const ACCESS_SECRET = new TextEncoder().encode(
  process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret-change-me'
);

const PROTECTED = ['/history'];
const AUTH_ONLY = ['/login', '/signup', '/forgot-password', '/reset-password', '/verify-email'];

async function verifyToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, ACCESS_SECRET);
    return true;
  } catch {
    return false;
  }
}

function buildCsp(nonce: string): string {
  // In dev the bundler (Turbopack/React Refresh) injects inline scripts and uses
  // eval, so we must stay permissive. In production we lock scripts down to a
  // per-request nonce; 'strict-dynamic' lets Next's nonced bootstrap script load
  // its own chunks without us whitelisting every hashed filename.
  const isProd = process.env.NODE_ENV === 'production';
  const scriptSrc = isProd
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";

  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://image.tmdb.org https://picsum.photos https://placehold.co https://images.unsplash.com https://*.public.blob.vercel-storage.com",
    "font-src 'self'",
    "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com",
    "connect-src 'self' https://api.themoviedb.org https://*.ingest.sentry.io https://*.sentry.io",
    "media-src 'self' https://www.youtube.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join('; ');
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const token = req.cookies.get('access_token')?.value;
  const isAuthenticated = token ? await verifyToken(token) : false;

  const isProtected = PROTECTED.some(p => pathname.startsWith(p));
  const isAuthPage = AUTH_ONLY.some(p => pathname.startsWith(p));

  if (isProtected && !isAuthenticated) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthPage && isAuthenticated) {
    const homeUrl = req.nextUrl.clone();
    homeUrl.pathname = '/profile';
    return NextResponse.redirect(homeUrl);
  }

  // Fresh nonce per request. Next.js reads it from the request CSP header and
  // stamps it onto every script it injects.
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set('Content-Security-Policy', csp);
  return res;
}

export const config = {
  matcher: [
    // Run on all page routes so each gets a CSP nonce, but skip API routes and
    // static assets (which don't render scripts and shouldn't pay the cost).
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
    },
  ],
};
