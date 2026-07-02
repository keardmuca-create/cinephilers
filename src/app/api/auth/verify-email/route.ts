import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { hashToken } from '@/lib/token-hash';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return err('Invalid JSON');

  const { token } = body as { token: string };
  if (!token) return err('Token is required');

  // Tokens are stored hashed (see lib/token-hash.ts) — hash the submitted
  // value and match the digest.
  const user = await prisma.user.findFirst({
    where: {
      emailVerificationToken: hashToken(token),
      emailVerificationExpires: { gt: new Date() },
    },
  });
  if (!user) return err('Invalid or expired verification token', 400);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      isVerified: true,
      emailVerificationToken: null,
      emailVerificationExpires: null,
    },
  });

  return ok(null, 'Email verified successfully. You can now log in.');
}
