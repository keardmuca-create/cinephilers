import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { sendPasswordResetEmail } from '@/lib/email';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return err('Invalid JSON');

  const { email } = body as { email: string };
  if (!email) return err('Email is required');

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  // Always return success to prevent email enumeration
  if (!user) return ok(null, 'If that email exists, a reset link has been sent.');

  const token = crypto.randomBytes(32).toString('hex');
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordResetToken: token,
      passwordResetExpires: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  try {
    await sendPasswordResetEmail(user.email, token);
  } catch {
    // Non-fatal in dev
  }

  return ok(null, 'If that email exists, a reset link has been sent.');
}
