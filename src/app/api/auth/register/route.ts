import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { sendVerificationEmail } from '@/lib/email';
import { rateLimit, getIp } from '@/lib/rate-limit';
import { hashToken } from '@/lib/token-hash';

export async function POST(req: NextRequest) {
  const { allowed, retryAfter } = await rateLimit(`register:${getIp(req)}`, 5, 60_000);
  if (!allowed) return err(`Too many attempts. Try again in ${retryAfter}s`, 429);

  const body = await req.json().catch(() => null);
  if (!body) return err('Invalid JSON');

  const { email, username, password, confirmPassword } = body as Record<string, string>;

  if (!email || !username || !password || !confirmPassword)
    return err('All fields are required');
  if (password !== confirmPassword) return err('Passwords do not match');
  if (password.length < 8) return err('Password must be at least 8 characters');
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username))
    return err('Username must be 3â€“20 alphanumeric characters or underscores');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err('Invalid email address');

  const [existingEmail, existingUsername] = await Promise.all([
    prisma.user.findUnique({ where: { email: email.toLowerCase() } }),
    prisma.user.findUnique({ where: { username: username.toLowerCase() } }),
  ]);
  if (existingEmail) return err('Email already in use');
  if (existingUsername) return err('Username already taken');

  const passwordHash = await bcrypt.hash(password, 12);
  const emailVerificationToken = crypto.randomBytes(32).toString('hex');
  const emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      username: username.toLowerCase(),
      passwordHash,
      // Stored hashed — the raw token exists only in the emailed link.
      emailVerificationToken: hashToken(emailVerificationToken),
      emailVerificationExpires,
    },
  });


  try {
    await sendVerificationEmail(user.email, emailVerificationToken);
  } catch {
    // Non-fatal â€” user is created, email may fail in dev
  }

  return ok(
    { id: user.id, email: user.email, username: user.username },
    'Account created. Please check your email to verify your account.',
    { status: 201 }
  );
}
