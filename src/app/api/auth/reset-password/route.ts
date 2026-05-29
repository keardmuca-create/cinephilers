import { NextRequest } from 'next/server';
import bcryptjs from 'bcryptjs';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return err('Invalid JSON');

  const { token, password, confirmPassword } = body as Record<string, string>;
  if (!token || !password || !confirmPassword) return err('All fields are required');
  if (password !== confirmPassword) return err('Passwords do not match');
  if (password.length < 8) return err('Password must be at least 8 characters');

  const user = await prisma.user.findFirst({
    where: {
      passwordResetToken: token,
      passwordResetExpires: { gt: new Date() },
    },
  });
  if (!user) return err('Invalid or expired reset token', 400);

  const passwordHash = await bcryptjs.hash(password, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      passwordResetToken: null,
      passwordResetExpires: null,
      refreshTokenHash: null, // invalidate all sessions
    },
  });

  return ok(null, 'Password reset successfully. You can now log in.');
}
