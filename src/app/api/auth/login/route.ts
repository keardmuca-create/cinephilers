import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { signAccessToken, signRefreshToken, setAuthCookies } from '@/lib/auth-utils';
import { rateLimit, getIp } from '@/lib/rate-limit';

// Email verification is only enforced for accounts created on or after this date.
// Everyone who signed up before it is grandfathered in (verification was never
// required, so most existing users have isVerified=false), and we don't flip
// their flag because isVerified also drives the public ✓ badge.
const VERIFY_REQUIRED_AFTER = new Date('2026-06-29T00:00:00.000Z');

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

  // Block unverified accounts created after enforcement began. The code lets the
  // login page surface a "resend verification email" action.
  if (!user.isVerified && user.createdAt >= VERIFY_REQUIRED_AFTER) {
    return NextResponse.json(
      {
        success: false,
        message: 'Please verify your email before signing in. Check your inbox for the verification link.',
        code: 'EMAIL_NOT_VERIFIED',
      },
      { status: 403 },
    );
  }

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
