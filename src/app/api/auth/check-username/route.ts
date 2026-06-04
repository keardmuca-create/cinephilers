import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get('u')?.trim() ?? '';

  if (!USERNAME_RE.test(u)) {
    return ok({ available: false, reason: 'invalid' });
  }

  const existing = await prisma.user.findUnique({
    where: { username: u.toLowerCase() },
    select: { id: true },
  });

  return ok({ available: !existing, reason: existing ? 'taken' : null });
}
