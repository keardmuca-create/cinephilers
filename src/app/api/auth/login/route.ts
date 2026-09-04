import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { signAccessToken, signRefreshToken, setAuthCookies, isNativeRequest } from '@/lib/auth-utils';
import { rateLimit, clearRateLimit, getIp } from '@/lib/rate-limit';
import { writeAudit, alreadyLoggedLockout } from '@/lib/audit';

// Email verification is only enforced for accounts created on or after this date.
// Everyone who signed up before it is grandfathered in (verification was never
// required, so most existing users have isVerified=false), and we don't flip
// their flag because isVerified also drives the public ✓ badge.
const VERIFY_REQUIRED_AFTER = new Date('2026-06-29T00:00:00.000Z');

// Failed attempts allowed against ONE account before it stops answering, and how
// long the lock lasts. Counted per account rather than per address: an attacker
// rotating IPs was previously unlimited against a single victim, because the only
// counter was keyed on where the request came from.
const ACCOUNT_ATTEMPT_LIMIT = 5;
const ACCOUNT_LOCK_MS = 15 * 60 * 1000;

export async function POST(req: NextRequest) {
  const { allowed, retryAfter } = await rateLimit(`login:${getIp(req)}`, 10, 60_000);
  if (!allowed) return err(`Too many attempts. Try again in ${retryAfter}s`, 429);

  const body = await req.json().catch(() => null);
  if (!body) return err('Invalid JSON');

  const { identifier, password } = body as { identifier: string; password: string };
  if (!identifier || !password) return err('Email/username and password are required');

  // Keyed on what was typed, lowercased, so "Keard" and "keard" share a counter
  // and an attacker cannot get a fresh allowance by changing the capitalisation.
  const accountKey = `login-account:${identifier.toLowerCase().trim()}`;
  const account = await rateLimit(accountKey, ACCOUNT_ATTEMPT_LIMIT, ACCOUNT_LOCK_MS);
  if (!account.allowed) {
    // Every attempt made while the lock holds comes through here, so writing
    // unconditionally would turn one lockout into a row per guess — the log
    // would be loudest exactly when it most needs to be readable. One row per
    // lock window instead; the attempts behind it are the limiter's business.
    if (!(await alreadyLoggedLockout(identifier, ACCOUNT_LOCK_MS))) {
      await writeAudit({
        action: 'LOGIN_LOCKED',
        // No actor: nobody proved who they were. The identifier that was typed
        // is the target, and it may not name a real account at all.
        targetLabel: identifier.toLowerCase().trim(),
        details: { lockMinutes: ACCOUNT_LOCK_MS / 60_000 },
      }, req);
    }
    const mins = Math.ceil(account.retryAfter / 60);
    return err(`Too many failed attempts for this account. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`, 429);
  }

  const isEmail = identifier.includes('@');
  const user = await prisma.user.findFirst({
    where: isEmail
      ? { email: identifier.toLowerCase() }
      : { username: identifier.toLowerCase() },
  });

  if (!user) return err('Invalid credentials', 401);

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return err('Invalid credentials', 401);

  // The password was right, so this attempt was not an attack — hand its slot
  // back. Without this the counter would treat five ordinary sign-ins the same
  // as five guesses and lock the owner out of their own account.
  await clearRateLimit(accountKey, ACCOUNT_LOCK_MS);

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

  // Native clients are cross-site, so the cookies just set never reach them —
  // they get the tokens in the body and store them themselves. The web is
  // deliberately NOT given them: the cookies are httpOnly and unreadable to
  // JavaScript, and returning the same tokens to the page would put a stealable
  // copy within reach of any XSS.
  const native = isNativeRequest(req);

  return ok({
    ...(native ? { accessToken, refreshToken } : {}),
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    isVerified: user.isVerified,
    role: user.role,
    // Returned so the login page can decide where to land without a second round
    // trip: an account that has never chosen any goes to the welcome screen once.
    favoriteGenres: user.favoriteGenres,
    // Both returned for the same reason: the login page decides where to land
    // with no second round trip. Never welcomed and created after the cutoff
    // means the Founder screen; see needsFounderWelcome.
    welcomedAt: user.welcomedAt,
    createdAt: user.createdAt,
  });
}
