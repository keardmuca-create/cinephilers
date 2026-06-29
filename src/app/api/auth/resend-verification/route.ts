import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { sendVerificationEmail } from '@/lib/email';
import { rateLimit, getIp } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  const { allowed, retryAfter } = await rateLimit(`resend-verify:${getIp(req)}`, 3, 60_000);
  if (!allowed) return err(`Too many attempts. Try again in ${retryAfter}s`, 429);

  const body = await req.json().catch(() => null);
  if (!body) return err('Invalid JSON');

  const { identifier } = body as { identifier: string };
  if (!identifier) return err('Email or username is required');

  const isEmail = identifier.includes('@');
  const user = await prisma.user.findFirst({
    where: isEmail
      ? { email: identifier.toLowerCase() }
      : { username: identifier.toLowerCase() },
  });

  // Only send when there's a matching account that still needs verifying. Either
  // way we return the same generic message so this can't be used to probe which
  // emails or usernames exist.
  if (user && !user.isVerified) {
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerificationToken: token, emailVerificationExpires: expires },
    });
    try {
      await sendVerificationEmail(user.email, token);
    } catch {
      // Non-fatal — token is saved; sending may fail in dev.
    }
  }

  return ok(null, 'If that account exists and still needs verifying, a new link is on the way.');
}
