import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { verifyRefreshToken, signAccessToken, signRefreshToken, setAuthCookies, clearAuthCookies, getRefreshTokenFromRequest } from '@/lib/auth-utils';
import { rateLimit, getIp } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  // Every call here is a database lookup and two token signings, and the client
  // calls it on a timer and on tab focus — so a loop on one device, or a script,
  // is a real cost. Generous enough that no legitimate session notices: the
  // interval is ten minutes and the client throttles focus refreshes to one a
  // minute, so twenty is many times what a busy tab needs.
  const { allowed, retryAfter } = await rateLimit(`refresh:${getIp(req)}`, 20, 60_000);
  if (!allowed) return err(`Too many requests. Try again in ${retryAfter}s`, 429);

  // Cookie for the web, Authorization header for native clients, which are
  // cross-site and have no cookie jar for this origin.
  const { token: refreshToken, fromHeader } = getRefreshTokenFromRequest(req);
  if (!refreshToken) return err('No refresh token', 401);

  const payload = await verifyRefreshToken(refreshToken);
  if (!payload) return err('Invalid refresh token', 401);

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) return err('Invalid refresh token', 401);

  // Stable refresh token: a token is valid as long as its version claim matches the
  // user's current tokenVersion. Logout / password reset bump tokenVersion to revoke
  // every session at once. There is NO per-call rotation, so any number of concurrent
  // refreshes (multi-tab, interval + 401-retry races) all succeed — nobody is ever
  // surprise-logged-out. Tokens minted before this field existed carry no ver claim;
  // we treat those as version 0 so the rollout doesn't log existing users out.
  const tokenVer = payload.ver ?? 0;
  if (tokenVer !== user.tokenVersion) return err('Refresh token revoked', 401);

  if (user.isBanned) {
    await clearAuthCookies();
    return err('This account has been suspended.', 403);
  }

  const accessPayload = { sub: user.id, username: user.username, role: user.role };
  const [newAccess, newRefresh] = await Promise.all([
    signAccessToken(accessPayload),
    signRefreshToken({ ...accessPayload, ver: user.tokenVersion }),
  ]);

  // Slide the 90-day window forward on every open so active users never expire.
  await setAuthCookies(newAccess, newRefresh);
  // The rotated refresh token is echoed back ONLY to a caller that presented one
  // in a header — i.e. a native client that already holds it. A browser riding
  // httpOnly cookies (including one running injected script) gets the access
  // token alone, so this cannot be used to lift a refresh token out of the jar.
  return ok({ accessToken: newAccess, ...(fromHeader ? { refreshToken: newRefresh } : {}) });
}
