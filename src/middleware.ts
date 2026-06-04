import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

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

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/history/:path*',
    '/login',
    '/signup',
    '/forgot-password',
    '/reset-password',
    '/verify-email',
  ],
};
