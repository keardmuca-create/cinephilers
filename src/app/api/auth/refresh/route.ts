import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { verifyRefreshToken, signAccessToken, signRefreshToken, setAuthCookies } from '@/lib/auth-utils';

export async function POST(req: NextRequest) {
  const refreshToken = req.cookies.get('refresh_token')?.value;
  if (!refreshToken) return err('No refresh token', 401);

  const payload = await verifyRefreshToken(refreshToken);
  if (!payload) return err('Invalid refresh token', 401);

  const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const user = await prisma.user.findFirst({
    where: { id: payload.sub, refreshTokenHash: refreshHash },
  });
  if (!user) return err('Refresh token revoked', 401);

  const newPayload = { sub: user.id, username: user.username, role: user.role };
  const [newAccess, newRefresh] = await Promise.all([
    signAccessToken(newPayload),
    signRefreshToken(newPayload),
  ]);
  const newHash = crypto.createHash('sha256').update(newRefresh).digest('hex');
  await prisma.user.update({ where: { id: user.id }, data: { refreshTokenHash: newHash } });

  await setAuthCookies(newAccess, newRefresh);
  return ok({ accessToken: newAccess });
}
