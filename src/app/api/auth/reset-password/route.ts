import { NextRequest } from 'next/server';
import bcryptjs from 'bcryptjs';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { rateLimit, getIp } from '@/lib/rate-limit';
import { hashToken } from '@/lib/token-hash';
import { writeAudit } from '@/lib/audit';

export async function POST(req: NextRequest) {
  const { allowed, retryAfter } = await rateLimit(`reset:${getIp(req)}`, 5, 60_000);
  if (!allowed) return err(`Too many attempts. Try again in ${retryAfter}s`, 429);

  const body = await req.json().catch(() => null);
  if (!body) return err('Invalid JSON');

  const { token, password, confirmPassword } = body as Record<string, string>;
  if (!token || !password || !confirmPassword) return err('All fields are required');
  if (password !== confirmPassword) return err('Passwords do not match');
  if (password.length < 8) return err('Password must be at least 8 characters');

  // Tokens are stored hashed (see lib/token-hash.ts) — hash the submitted
  // value and match the digest.
  const user = await prisma.user.findFirst({
    where: {
      passwordResetToken: hashToken(token),
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
      tokenVersion: { increment: 1 }, // invalidate all existing sessions
    },
  });

  // The actor and the target are the same person here — whoever held the emailed
  // token. The IP is the useful column: it is what tells the owner of an account
  // whether the reset that logged them out everywhere was theirs.
  await writeAudit({
    action: 'PASSWORD_RESET_COMPLETED',
    actorId: user.id,
    actorUsername: user.username,
    targetId: user.id,
    targetLabel: user.username,
    details: { sessionsRevoked: true },
  }, req);

  return ok(null, 'Password reset successfully. You can now log in.');
}
