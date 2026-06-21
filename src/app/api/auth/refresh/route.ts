import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { verifyRefreshToken, signAccessToken, signRefreshToken, setAuthCookies, clearAuthCookies } from '@/lib/auth-utils';

export async function POST(req: NextRequest) {
  const refreshToken = req.cookies.get('refresh_token')?.value;
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
  return ok({ accessToken: newAccess });
}
