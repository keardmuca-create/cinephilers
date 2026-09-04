import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';

function requireSecret(name: string): string {
  const s = process.env[name];
  if (!s) {
    // Any deployed environment (prod, preview, staging) must supply real
    // secrets — never fall back to a predictable constant a forger could use.
    // The fallback is only for local `next dev`.
    const isDeployed = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
    if (isDeployed) throw new Error(`${name} must be set in deployed environments`);
    return `dev-${name.toLowerCase()}-change-me`;
  }
  return s;
}
function getAccessSecret() {
  return new TextEncoder().encode(requireSecret('JWT_ACCESS_SECRET'));
}
function getRefreshSecret() {
  return new TextEncoder().encode(requireSecret('JWT_REFRESH_SECRET'));
}

const ACCESS_EXPIRES = process.env.JWT_ACCESS_EXPIRES ?? '15m';
// Long-lived so active users effectively never see a login screen. Refresh
// tokens are deliberately STABLE (no per-use rotation — see /api/auth/refresh):
// a fresh token with the same tokenVersion is re-minted on each refresh, which
// slides the 90-day window forward without ever invalidating concurrent tabs.
// Revocation is via bumping user.tokenVersion (logout / password reset).
// MUST stay in sync with the refresh cookie maxAge in setAuthCookies below.
const REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES ?? '90d';
const REFRESH_MAX_AGE = 60 * 60 * 24 * 90; // 90 days, in seconds

export interface JwtPayload {
  sub: string;   // userId
  username: string;
  role: string;
  ver?: number;  // tokenVersion — present on refresh tokens only; bumped to revoke all sessions
}

export async function signAccessToken(payload: JwtPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ACCESS_EXPIRES)
    .sign(getAccessSecret());
}

export async function signRefreshToken(payload: JwtPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(REFRESH_EXPIRES)
    .sign(getRefreshSecret());
}

export async function verifyAccessToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getAccessSecret(), { algorithms: ['HS256'] });
    return payload as unknown as JwtPayload;
  } catch {
    return null;
  }
}

export async function verifyRefreshToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getRefreshSecret(), { algorithms: ['HS256'] });
    return payload as unknown as JwtPayload;
  } catch {
    return null;
  }
}

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

export async function setAuthCookies(accessToken: string, refreshToken: string) {
  const jar = await cookies();
  jar.set('access_token', accessToken, { ...COOKIE_OPTS, maxAge: 60 * 15 });
  jar.set('refresh_token', refreshToken, { ...COOKIE_OPTS, maxAge: REFRESH_MAX_AGE });
}

export async function clearAuthCookies() {
  const jar = await cookies();
  jar.set('access_token', '', { ...COOKIE_OPTS, maxAge: 0 });
  jar.set('refresh_token', '', { ...COOKIE_OPTS, maxAge: 0 });
}

// A Capacitor app runs from a local origin, so it is cross-site to this API and
// the SameSite=Lax cookies above never reach it. Native clients announce
// themselves with this header and carry their tokens by hand instead.
export const CLIENT_HEADER = 'x-client';

export function isNativeRequest(req: NextRequest): boolean {
  return req.headers.get(CLIENT_HEADER)?.toLowerCase() === 'native';
}

// The refresh token, from the cookie jar if there is one and from the
// Authorization header if there is not. `fromHeader` is reported back because
// it decides whether the caller may be handed a new refresh token in the
// response body: only a client that already presented one gets one returned.
export function getRefreshTokenFromRequest(req: NextRequest): { token: string | null; fromHeader: boolean } {
  const fromCookie = req.cookies.get('refresh_token')?.value;
  if (fromCookie) return { token: fromCookie, fromHeader: false };
  const auth = req.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) return { token: auth.slice(7), fromHeader: true };
  return { token: null, fromHeader: false };
}

export async function getAccessTokenFromRequest(req: NextRequest): Promise<string | null> {
  const fromCookie = req.cookies.get('access_token')?.value;
  if (fromCookie) return fromCookie;
  const auth = req.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

export async function getCurrentUser(req?: NextRequest): Promise<JwtPayload | null> {
  let token: string | null = null;
  if (req) {
    token = await getAccessTokenFromRequest(req);
  } else {
    const jar = await cookies();
    token = jar.get('access_token')?.value ?? null;
  }
  if (!token) return null;
  return verifyAccessToken(token);
}
