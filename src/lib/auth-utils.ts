import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';

const ACCESS_SECRET = new TextEncoder().encode(
  process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret-change-me'
);
const REFRESH_SECRET = new TextEncoder().encode(
  process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret-change-me'
);

const ACCESS_EXPIRES = process.env.JWT_ACCESS_EXPIRES ?? '15m';
const REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES ?? '7d';

export interface JwtPayload {
  sub: string;   // userId
  username: string;
  role: string;
}

export async function signAccessToken(payload: JwtPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ACCESS_EXPIRES)
    .sign(ACCESS_SECRET);
}

export async function signRefreshToken(payload: JwtPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(REFRESH_EXPIRES)
    .sign(REFRESH_SECRET);
}

export async function verifyAccessToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, ACCESS_SECRET);
    return payload as unknown as JwtPayload;
  } catch {
    return null;
  }
}

export async function verifyRefreshToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, REFRESH_SECRET);
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
  jar.set('refresh_token', refreshToken, { ...COOKIE_OPTS, maxAge: 60 * 60 * 24 * 7 });
}

export async function clearAuthCookies() {
  const jar = await cookies();
  jar.set('access_token', '', { ...COOKIE_OPTS, maxAge: 0 });
  jar.set('refresh_token', '', { ...COOKIE_OPTS, maxAge: 0 });
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
