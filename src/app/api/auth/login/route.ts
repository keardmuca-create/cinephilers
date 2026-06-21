import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { signAccessToken, signRefreshToken, setAuthCookies } from '@/lib/auth-utils';
import { rateLimit, getIp } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  const { allowed, retryAfter } = await rateLimit(`login:${getIp(req)}`, 10, 60_000);
  if (!allowed) return err(`Too many attempts. Try again in ${retryAfter}s`, 429);

  const body = await req.json().catch(() => null);
  if (!body) return err('Invalid JSON');

  const { identifier, password } = body as { identifier: string; password: string };
  if (!identifier || !password) return err('Email/username and password are required');

  const isEmail = identifier.includes('@');
  const user = await prisma.user.findFirst({
    where: isEmail
      ? { email: identifier.toLowerCase() }
      : { username: identifier.toLowerCase() },
  });

  if (!user) return err('Invalid credentials', 401);

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return err('Invalid credentials', 401);

  if (user.isBanned) return err('This account has been suspended.', 403);

  const payload = { sub: user.id, username: user.username, role: user.role };
  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken(payload),
    signRefreshToken({ ...payload, ver: user.tokenVersion }),
  ]);

  await setAuthCookies(accessToken, refreshToken);

  return ok({
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    isVerified: user.isVerified,
    role: user.role,
  });
}
